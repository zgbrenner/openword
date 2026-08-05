# OpenWord Writer Runtime

OpenWord uses one document engine: LibreOffice Writer. The initial host is a local LibreOffice WebAssembly build, commonly called LOWA, controlled through zetajs and UNO.

## Source locking

Run `node engine/scripts/resolve-runtime.mjs` to resolve every configured source ref to an exact 40-character commit and write `engine/runtime.lock.json`. Releases must build from the committed lock file rather than floating branches or tags.

## Runtime files

Place the matching Writer runtime in `public/writer-runtime/`:

- `soffice.js`
- `soffice.wasm`
- `soffice.data`
- `soffice.data.js.metadata`
- `zeta.js`
- `openword_writer_thread.js`

Run `node engine/scripts/verify-runtime.mjs` before development packaging or release packaging.

## Security requirements

Production builds must be fully local. Do not enable Emscripten proxy POSIX sockets or any other network transport. Macro runtimes and arbitrary UNO extension loading are disabled. Document macro payloads may eventually be preserved as inert package data, but OpenWord never executes them.

## Build scope

The build includes Writer, DOCX and ODT filters, and Writer PDF export dependencies. It does not ship Calc, Impress, Base, or Draw user interfaces unless a verified Writer dependency requires code from those modules.

## Licensing

OpenWord shell and bridge code remain Apache-2.0. zetajs is MIT licensed. LibreOffice and modifications to covered LibreOffice files remain under the applicable LibreOffice and MPL 2.0 terms. Every distributed runtime must include required notices and a source location for the exact modified sources used to build it.
