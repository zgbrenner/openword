/*
 * OpenWord service worker (classic script, no dependencies).
 *
 * Responsibilities:
 * 1. Inject cross-origin isolation headers (COOP/COEP/CORP) so threaded
 *    Writer WASM works on static hosts that cannot set response headers.
 * 2. Cache the app shell and the large Writer runtime for full offline use.
 */

"use strict";

var VERSION = "v1";
var SHELL_CACHE = "openword-shell-" + VERSION;
var RUNTIME_CACHE = "openword-runtime-" + VERSION;
var KNOWN_CACHES = [SHELL_CACHE, RUNTIME_CACHE];

/* Scope-relative path prefix, so subpath hosting (e.g. GitHub Pages) works. */
var SCOPE_PATH = new URL(self.registration.scope).pathname;

/* ---------------------------------------------------------------- lifecycle */

self.addEventListener("install", function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (names) {
        return Promise.all(
          names.map(function (name) {
            var stale =
              /^openword-(shell|runtime)-/.test(name) &&
              KNOWN_CACHES.indexOf(name) === -1;
            return stale ? caches.delete(name) : Promise.resolve(false);
          }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

/* ----------------------------------------------------------- header rewrap */

/*
 * Every response served through this worker carries the isolation headers
 * the Writer runtime requires. Opaque and error responses cannot be
 * reconstructed, so they pass through untouched.
 */
function withIsolationHeaders(response, isNavigation) {
  if (!response || response.type === "opaque" || response.type === "error") {
    return response;
  }
  var headers = new Headers(response.headers);
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  if (isNavigation) {
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers,
  });
}

/* ---------------------------------------------------------------- caching */

/* Quota failures (the runtime is hundreds of MB) must never break serving. */
function putSafely(cacheName, request, response) {
  return caches
    .open(cacheName)
    .then(function (cache) {
      return cache.put(request, response);
    })
    .catch(function () {
      /* Storage pressure or eviction; the network response still serves. */
    });
}

function isCacheable(response) {
  /* Only complete, successful same-origin responses; never 206 partials. */
  return Boolean(response && response.ok && response.status === 200 && response.type !== "opaque");
}

function networkFirst(request, cacheName, isNavigation) {
  return fetch(request)
    .then(function (response) {
      if (isCacheable(response)) {
        putSafely(cacheName, request, response.clone());
      }
      return withIsolationHeaders(response, isNavigation);
    })
    .catch(function (networkError) {
      return caches.match(request).then(function (cached) {
        if (cached) return withIsolationHeaders(cached, isNavigation);
        throw networkError;
      });
    });
}

/*
 * Runtime cache invalidation.
 *
 * Invariant: the cached runtime must always be the one described by the
 * cached manifest. Runtime asset URLs (soffice.wasm, soffice.data, ...)
 * never change across engine versions, so cache-first would serve a stale
 * engine forever after a deploy. When a freshly fetched manifest differs
 * from the cached copy (or there is no cached manifest but the runtime
 * cache already holds entries we cannot verify), the entire runtime cache
 * is deleted before the fresh manifest is cached, so every runtime asset
 * re-fetches to match the new manifest. On network failure the cached
 * manifest still serves, exactly like plain network-first.
 */
function manifestNetworkFirst(request) {
  return fetch(request)
    .then(function (response) {
      if (!isCacheable(response)) {
        return withIsolationHeaders(response, false);
      }
      var freshCopy = response.clone();
      var cacheCopy = response.clone();
      return freshCopy
        .text()
        .then(function (freshText) {
          return caches.open(RUNTIME_CACHE).then(function (cache) {
            return cache.match(request).then(function (cachedManifest) {
              if (cachedManifest) {
                return cachedManifest.text().then(function (cachedText) {
                  return cachedText !== freshText;
                });
              }
              /* No cached manifest: any existing runtime entries are
                 unverifiable, so treat a non-empty cache as stale. */
              return cache.keys().then(function (keys) {
                return keys.length > 0;
              });
            });
          });
        })
        .then(function (stale) {
          var cleared = stale ? caches.delete(RUNTIME_CACHE) : Promise.resolve(false);
          return cleared.then(function () {
            return putSafely(RUNTIME_CACHE, request, cacheCopy);
          });
        })
        .catch(function () {
          /* Invalidation is best-effort; never break serving the manifest. */
        })
        .then(function () {
          return withIsolationHeaders(response, false);
        });
    })
    .catch(function (networkError) {
      return caches.match(request).then(function (cached) {
        if (cached) return withIsolationHeaders(cached, false);
        throw networkError;
      });
    });
}

/* ---------------------------------------------------- download progress */

var PROGRESS_CHANNEL_NAME = "openword-runtime-progress";
var PROGRESS_INTERVAL_MS = 250;
var progressChannel = null;

function getProgressChannel() {
  if (typeof BroadcastChannel !== "function") return null;
  if (!progressChannel) {
    progressChannel = new BroadcastChannel(PROGRESS_CHANNEL_NAME);
  }
  return progressChannel;
}

/*
 * First-visit download progress: the body served to the page is piped
 * through a counting TransformStream that posts
 *   { kind: "progress", file, received, total }
 * messages (throttled to at most one per ~250ms per file) and a final
 *   { kind: "done", file, total }
 * on the "openword-runtime-progress" BroadcastChannel. Callers must take
 * the cache clone BEFORE wrapping so cache.put stores the complete,
 * untouched bytes. Progress reporting must never break serving: any
 * failure falls back to the plain response.
 */
function withDownloadProgress(response, file) {
  try {
    if (typeof BroadcastChannel !== "function") return response;
    if (typeof TransformStream !== "function") return response;
    if (!response || !response.body || !isCacheable(response)) return response;
    var total = parseInt(response.headers.get("content-length") || "", 10);
    if (!isFinite(total) || total <= 0) return response;
    var channel = getProgressChannel();
    if (!channel) return response;

    var received = 0;
    var lastPostedAt = 0;
    var counter = new TransformStream({
      transform: function (chunk, controller) {
        received += chunk && chunk.byteLength ? chunk.byteLength : 0;
        var now = Date.now();
        if (now - lastPostedAt >= PROGRESS_INTERVAL_MS) {
          lastPostedAt = now;
          try {
            channel.postMessage({ kind: "progress", file: file, received: received, total: total });
          } catch (ignored) {
            /* Progress is advisory only. */
          }
        }
        controller.enqueue(chunk);
      },
      flush: function () {
        try {
          channel.postMessage({ kind: "done", file: file, total: total });
        } catch (ignored) {
          /* Progress is advisory only. */
        }
      },
    });
    return new Response(response.body.pipeThrough(counter), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (ignored) {
    return response;
  }
}

function cacheFirst(request, cacheName, progressFile) {
  return caches.match(request).then(function (cached) {
    /* Cache hits never report progress. */
    if (cached) return withIsolationHeaders(cached, false);
    return fetch(request).then(function (response) {
      if (isCacheable(response)) {
        /* Clone for the cache BEFORE any progress wrapping, so the cache
           always stores complete, untouched bytes. */
        putSafely(cacheName, request, response.clone());
      }
      var served = progressFile ? withDownloadProgress(response, progressFile) : response;
      return withIsolationHeaders(served, false);
    });
  });
}

/* ------------------------------------------------------------------ fetch */

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* Range requests (soffice.data may be range-requested) bypass the caches:
     the Cache API cannot answer partial reads correctly. */
  if (request.headers.has("range")) {
    event.respondWith(
      fetch(request).then(function (response) {
        return withIsolationHeaders(response, false);
      }),
    );
    return;
  }

  var isNavigation = request.mode === "navigate";
  var scoped = url.pathname.slice(SCOPE_PATH.length);

  if (isNavigation) {
    /* Navigations: network-first so deploys land, cache fallback offline. */
    event.respondWith(networkFirst(request, SHELL_CACHE, true));
  } else if (scoped === "writer-runtime/runtime-manifest.json") {
    /* Integrity preflight: prefer fresh hashes, keep offline working, and
       drop the runtime cache when the manifest body changed. */
    event.respondWith(manifestNetworkFirst(request));
  } else if (scoped.indexOf("writer-runtime/") === 0) {
    /* Runtime assets are pinned by the manifest: cache-first, with
       first-visit download progress on network misses. */
    event.respondWith(cacheFirst(request, RUNTIME_CACHE, scoped));
  } else if (scoped.indexOf("assets/") === 0) {
    /* Vite build output is content-hashed: cache-first is safe. */
    event.respondWith(cacheFirst(request, SHELL_CACHE));
  } else {
    /* Favicons, manifest, and other shell files: network-first. */
    event.respondWith(networkFirst(request, SHELL_CACHE, false));
  }
});
