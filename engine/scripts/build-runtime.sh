#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKDIR="${OPENWORD_ENGINE_WORKDIR:-$ROOT/.engine-work}"
JOBS="${OPENWORD_BUILD_JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)}"
QT_PREFIX="$WORKDIR/qt-install"
EMSCRIPTEN_VERSION="3.1.65"

fail() {
  printf 'OpenWord Writer build: %s\n' "$1" >&2
  exit 1
}

[[ "$(uname -s)" == "Linux" ]] || fail "the reproducible LOWA build currently requires Linux x86_64"
[[ "$(uname -m)" == "x86_64" ]] || fail "the pinned build host is linux-x86_64"
for command in git node python3 make cmake ninja; do
  command -v "$command" >/dev/null 2>&1 || fail "missing required command: $command"
done

if [[ -r /proc/meminfo ]]; then
  memory_kib="$(awk '/MemTotal:/ { print $2 }' /proc/meminfo)"
  minimum_kib=$((60 * 1024 * 1024))
  (( memory_kib >= minimum_kib )) || fail "LibreOffice WASM linking needs a 64 GiB-class host; detected less than 60 GiB"
fi

mkdir -p "$WORKDIR"
node "$ROOT/engine/scripts/prepare-sources.mjs" "$WORKDIR"

pushd "$WORKDIR/emsdk" >/dev/null
./emsdk install "$EMSCRIPTEN_VERSION"
./emsdk activate "$EMSCRIPTEN_VERSION"
rm -rf upstream/emscripten
ln -s "$WORKDIR/emscripten" upstream/emscripten
# shellcheck disable=SC1091
source ./emsdk_env.sh >/dev/null
popd >/dev/null

emcc_version="$(emcc --version | head -n 1)"
[[ "$emcc_version" == *"$EMSCRIPTEN_VERSION"* ]] || fail "expected Emscripten $EMSCRIPTEN_VERSION, got: $emcc_version"

if [[ ! -x "$QT_PREFIX/bin/qmake" || "${OPENWORD_REBUILD_QT:-0}" == "1" ]]; then
  rm -rf "$QT_PREFIX"
  pushd "$WORKDIR/qt5" >/dev/null
  ./configure \
    -opensource \
    -confirm-license \
    -xplatform wasm-emscripten \
    -feature-thread \
    -nomake tests \
    -nomake examples \
    -prefix "$QT_PREFIX" \
    QMAKE_CFLAGS+=-sSUPPORT_LONGJMP=wasm \
    QMAKE_CXXFLAGS+=-sSUPPORT_LONGJMP=wasm
  make -j"$JOBS" module-qtbase
  make -j"$JOBS" install
  popd >/dev/null
fi

pushd "$WORKDIR/libreoffice" >/dev/null
if [[ ! -f config_host.mk || "${OPENWORD_RECONFIGURE_LO:-0}" == "1" ]]; then
  QT5DIR="$QT_PREFIX" ./autogen.sh \
    --with-distro=LibreOfficeWASM32 \
    --with-lang=en-US \
    --disable-online-update
fi
make -j"$JOBS"
popd >/dev/null

node "$ROOT/engine/scripts/install-runtime.mjs"
node "$ROOT/engine/scripts/verify-runtime.mjs"
printf 'OpenWord Writer runtime build completed.\n'
