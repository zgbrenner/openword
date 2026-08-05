# OpenWord Writer Runtime

OpenWord uses one document engine: LibreOffice Writer. The initial host is a local Writer-only LibreOffice WebAssembly build, commonly called LOWA, controlled through zetajs and UNO.

## What is pinned

`engine/manifest.json` describes the supported upstream lines. `engine/runtime.lock.json` pins exact commits for LibreOffice, zetajs, emsdk, the Allotropia Emscripten fork, the Qt supermodule, and qtbase. Annotated Git tags are peeled to their commit before the lock is written.

Refresh the lock deliberately:

```bash
npm run engine:lock
```

Review every changed commit before accepting a refreshed lock. Releases build from the committed lock file, never directly from floating branches or tags.

## Build requirements

The reproducible build currently targets Linux x86_64. LibreOffice's own WASM documentation warns that linking can need roughly 64 GiB of RAM; the wrapper refuses hosts with less than a 60 GiB detected baseline. Allow substantial disk space for LibreOffice, Qt, Emscripten, downloads, and intermediate objects.

Required commands include Git, Node.js, Python 3, Make, CMake, and Ninja. The build wrapper installs the pinned emsdk release, replaces its Emscripten source with the pinned Allotropia fork, builds the pinned Qt WASM tree, and then builds LibreOffice with `LibreOfficeWASM32`.

```bash
OPENWORD_ENGINE_WORKDIR=/fast-storage/openword-engine \
OPENWORD_BUILD_JOBS=8 \
npm run engine:build
```

Optional controls:

- `OPENWORD_REBUILD_QT=1` forces a clean Qt rebuild.
- `OPENWORD_RECONFIGURE_LO=1` reruns LibreOffice configuration.
- `OPENWORD_ENGINE_WORKDIR` relocates the ignored source/build workspace.

The script intentionally does not use GitHub-hosted CI runners. The memory and link-time requirements call for a dedicated builder or sufficiently large local machine.

## Runtime installation

A successful build installs these generated files into `public/writer-runtime/`:

- `soffice.js`
- `soffice.wasm`
- `soffice.data`
- `soffice.data.js.metadata`
- `zeta.js`
- `runtime-manifest.json`

`openword_writer_thread.js` is OpenWord source and remains committed beside the generated files. The runtime manifest records byte counts, SHA-256 hashes, and the exact source lock used to create the artifacts.

Verify before packaging:

```bash
npm run engine:verify
```

Tauri desktop packaging calls this verification automatically and fails if runtime files are missing, modified, or built from a different source lock.

## Runtime security

Production assets are fully local. The build does not enable Emscripten proxy POSIX sockets or other network transport. Tauri and Vite both set COOP/COEP headers because threaded LOWA requires `SharedArrayBuffer`. The runtime host refuses to start without cross-origin isolation.

Macro runtimes and arbitrary UNO extension loading are disabled. Document macro payloads may later be preserved as inert package data for round-trip fidelity, but OpenWord never executes them.

## Build scope

The build uses LibreOffice's `LibreOfficeWASM32` distro configuration, which produces a Writer-only Qt build and disables scripting. It includes the Writer document model, layout, DOCX and ODT filters, and Writer PDF-export dependencies. OpenWord does not expose Calc, Impress, Base, or Draw interfaces.

## Licensing

OpenWord shell and bridge code remain Apache-2.0. zetajs is MIT licensed. LibreOffice code and modifications to covered LibreOffice files remain under the applicable LibreOffice and MPL 2.0 terms. Every distributed runtime must include required notices and a stable source location for the exact modified sources used to build it.
