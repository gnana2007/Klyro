import { existsSync } from "node:fs";
console.log("Node", process.version);
for (const name of [
  "ZERO_G_API_KEY",
  "ZERO_G_MODEL",
  "ZERO_G_FREE_CREDITS_CONFIRMED",
  "OPERATOR_TOKEN",
  "REGISTRY_ADDRESS",
])
  console.log(name, process.env[name] ? "set" : "missing");
for (const path of [
  "node_modules/@foundry-rs/forge/bin.mjs",
  "node_modules/@foundry-rs/anvil/bin.mjs",
  "package-lock.json",
])
  console.log(path, existsSync(path) ? "present" : "missing");
console.log("No credentials, keys, balances or secrets are printed.");
