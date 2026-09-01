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

function cacheFirst(request, cacheName) {
  return caches.match(request).then(function (cached) {
    if (cached) return withIsolationHeaders(cached, false);
    return fetch(request).then(function (response) {
      if (isCacheable(response)) {
        putSafely(cacheName, request, response.clone());
      }
      return withIsolationHeaders(response, false);
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
    /* Integrity preflight: prefer fresh hashes, keep offline working. */
    event.respondWith(networkFirst(request, RUNTIME_CACHE, false));
  } else if (scoped.indexOf("writer-runtime/") === 0) {
    /* Runtime assets are content-addressed by the manifest: cache-first. */
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
  } else if (scoped.indexOf("assets/") === 0) {
    /* Vite build output is content-hashed: cache-first is safe. */
    event.respondWith(cacheFirst(request, SHELL_CACHE));
  } else {
    /* Favicons, manifest, and other shell files: network-first. */
    event.respondWith(networkFirst(request, SHELL_CACHE, false));
  }
});
