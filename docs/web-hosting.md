# Hosting the OpenWord website build

The website build is a static site. There is no server component: documents never leave the browser, and every request after first load is a same-origin asset fetch.

## Build

1. Build or install the Writer runtime into `public/writer-runtime/` first:

   ```sh
   npm run engine:build
   ```

   Alternatively, install a verified prebuilt runtime into `public/writer-runtime/`. The build is incomplete without it: the runtime host verifies `runtime-manifest.json` (byte lengths and SHA-256 hashes) before starting.

2. Build the site:

   ```sh
   npm run build:web
   ```

   Output lands in `dist-web/`. Deploy that directory as-is. The runtime assets are large (hundreds of MB, dominated by `soffice.wasm` and `soffice.data`), so account for artifact-size limits on your host.

## Required headers

Writer is threaded WebAssembly and requires `SharedArrayBuffer`, so every document response must be cross-origin isolated. The runtime host refuses to start otherwise. Serve all responses with:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Resource-Policy: same-origin`
- `X-Content-Type-Options: nosniff`

and serve `.wasm` files with the `application/wasm` MIME type (required for streaming compilation).

### nginx

```nginx
server {
    root /srv/openword/dist-web;

    types {
        application/wasm wasm;
    }

    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Cross-Origin-Resource-Policy "same-origin" always;
    add_header X-Content-Type-Options "nosniff" always;
}
```

### Caddy

```caddyfile
example.com {
    root * /srv/openword/dist-web
    file_server

    header {
        Cross-Origin-Opener-Policy "same-origin"
        Cross-Origin-Embedder-Policy "require-corp"
        Cross-Origin-Resource-Policy "same-origin"
        X-Content-Type-Options "nosniff"
    }
}
```

Caddy serves `.wasm` as `application/wasm` by default.

### Netlify (`_headers` file in the publish directory)

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Resource-Policy: same-origin
  X-Content-Type-Options: nosniff
```

Netlify serves `.wasm` as `application/wasm` by default.

### Hosts that cannot set headers

Static hosts without header control (for example GitHub Pages) still work. `openword-sw.js` re-serves every response with the isolation headers injected by a service worker. The cost is one automatic reload on the first visit, so the page can come back under service-worker control with the injected headers. Subpath hosting (`https://user.github.io/openword/`) is supported; all asset URLs are relative.

## Offline behavior

The service worker caches on use with the Cache API: the app shell and the Writer runtime are stored as they are first fetched. The first visit downloads the multi-hundred-MB runtime; subsequent visits, including fully offline ones, are served locally. Runtime assets are cached cache-first (they are content-addressed by the runtime manifest's hashes); `runtime-manifest.json` and navigations are network-first so updates propagate, with cache fallback offline.

## Browser support

| Browser | Editing | Document storage and saving |
| --- | --- | --- |
| Chromium (Chrome, Edge) | Full | Full, including File System Access API save-in-place to local files |
| Firefox | Full | Browser-storage documents, download-based export |
| Safari | Full | Browser-storage documents, download-based export |

All browsers must support `SharedArrayBuffer` under cross-origin isolation; every current release of the above does.

## Privacy

There is no server storage. Documents live in browser storage (OPFS/IndexedDB) or in local files the user explicitly picks. After the site loads, it makes no network requests beyond fetching its own same-origin assets.
