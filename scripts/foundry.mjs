import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const platform =
  process.platform === "win32"
    ? "win32-amd64"
    : `${process.platform}-${process.arch === "x64" ? "amd64" : "arm64"}`;
const binary = resolve(
  `node_modules/@foundry-rs/forge-${platform}/bin/forge${process.platform === "win32" ? ".exe" : ""}`,
);
const args = process.argv.slice(2);
const result = spawnSync(binary, [...args, "--root", resolve("contracts")], {
  stdio: "inherit",
  env: process.env,
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
