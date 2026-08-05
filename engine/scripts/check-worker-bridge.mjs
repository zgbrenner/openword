import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const worker = readFileSync(resolve(root, "public/writer-runtime/openword_writer_thread.js"), "utf8");
const registrySource = readFileSync(
  resolve(root, "public/writer-runtime/openword_writer_commands.js"),
  "utf8",
);
const context = { Object };
runInNewContext(registrySource, context, { filename: "openword_writer_commands.js" });
const registry = context.OPENWORD_WRITER_COMMANDS;

for (const required of [
  "engine.ping",
  "document.new",
  "document.open",
  "document.save",
  "document.snapshot",
  "command.execute",
  "selection.formatting",
  "selection.paragraph",
  "selection.pageStyle",
]) {
  if (!worker.includes(required)) throw new Error(`Worker bridge missing ${required}`);
}

for (const [semantic, uno] of Object.entries({
  "format.toggleBold": ".uno:Bold",
  "format.toggleItalic": ".uno:Italic",
  "format.toggleUnderline": ".uno:Underline",
  "insert.pageBreak": ".uno:InsertPagebreak",
  "header.edit": ".uno:JumpToHeader",
  "footer.edit": ".uno:JumpToFooter",
})) {
  if (registry?.[semantic] !== uno) throw new Error(`Writer command registry mismatch for ${semantic}`);
}

if (!worker.includes("const commandUrls = OPENWORD_WRITER_COMMANDS")) {
  throw new Error("Worker bridge does not consume the immutable command registry");
}

console.log("Writer worker bridge and semantic command registry are consistent.");
