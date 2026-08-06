import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "../..");
const lock = JSON.parse(readFileSync(resolve(root, "engine/runtime.lock.json"), "utf8"));
const workdir = resolve(process.argv[2] || process.env.OPENWORD_ENGINE_WORKDIR || resolve(root, ".engine-work"));

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function checkoutExact(name, target) {
  const source = lock.sources[name];
  if (!source) throw new Error(`Missing locked source: ${name}`);

  if (!existsSync(resolve(target, ".git"))) {
    mkdirSync(target, { recursive: true });
    run("git", ["init"], target);
    run("git", ["remote", "add", "origin", source.repository], target);
  } else {
    run("git", ["remote", "set-url", "origin", source.repository], target);
  }

  run("git", ["fetch", "--depth=1", "origin", source.commit], target);
  run("git", ["checkout", "--detach", "--force", "FETCH_HEAD"], target);
  run("git", ["clean", "-ffd"], target);

  const actual = execFileSync("git", ["rev-parse", "HEAD"], { cwd: target, encoding: "utf8" }).trim();
  if (actual !== source.commit) throw new Error(`${name} resolved to ${actual}, expected ${source.commit}`);
}

mkdirSync(workdir, { recursive: true });
checkoutExact("libreoffice", resolve(workdir, "libreoffice"));
checkoutExact("zetajs", resolve(workdir, "zetajs"));
checkoutExact("emsdk", resolve(workdir, "emsdk"));
checkoutExact("emscripten", resolve(workdir, "emscripten"));
checkoutExact("qt5", resolve(workdir, "qt5"));

// The Qt supermodule only needs qtbase for the Writer WASM build. Pinning it
// independently avoids a floating submodule checkout during init-repository.
const qtbaseTarget = resolve(workdir, "qt5/qtbase");
if (existsSync(qtbaseTarget)) rmSync(qtbaseTarget, { recursive: true, force: true });
checkoutExact("qtbase", qtbaseTarget);

console.log(`Prepared exact Writer sources in ${workdir}`);
