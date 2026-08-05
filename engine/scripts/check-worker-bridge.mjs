import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = readFileSync(resolve(root, "public/writer-runtime/openword_writer_thread.js"), "utf8");

for (const required of [
  "engine.ping",
  "document.new",
  "document.open",
  "document.save",
  "command.execute",
  ".uno:Bold",
  ".uno:Italic",
  ".uno:Underline",
]) {
  if (!source.includes(required)) throw new Error(`Worker bridge missing ${required}`);
}

console.log("Writer worker bridge contains all foundation commands.");
