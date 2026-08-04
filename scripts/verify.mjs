import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const frontendOnly = process.argv.includes("--frontend-only");
const workflowDirectory = join(process.cwd(), ".github", "workflows");

if (existsSync(workflowDirectory)) {
  const workflows = readdirSync(workflowDirectory).filter((name) => /\.ya?ml$/i.test(name));
  if (workflows.length > 0) {
    console.error(`GitHub Actions are intentionally disabled, but workflow files were found: ${workflows.join(", ")}`);
    process.exit(1);
  }
}

const commands = [
  ["npm", ["run", "check"]],
  ["npm", ["run", "lint"]],
  ["npm", ["run", "test"]],
  ["npm", ["run", "build"]],
];

function run(command, args) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

for (const [command, args] of commands) run(command, args);

if (frontendOnly) {
  console.log("\nOpenWord frontend verification completed successfully.");
  process.exit(0);
}

const cargo = spawnSync("cargo", ["--version"], { stdio: "ignore" });
if (cargo.status !== 0) {
  console.error(
    "\nFrontend verification passed, but full verification is incomplete because Rust/Cargo is not installed.",
  );
  process.exit(2);
}

run("cargo", ["fmt", "--check", "--manifest-path", "src-tauri/Cargo.toml"]);
run("cargo", ["check", "--manifest-path", "src-tauri/Cargo.toml"]);

console.log("\nOpenWord verification completed successfully.");
