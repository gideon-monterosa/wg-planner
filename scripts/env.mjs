#!/usr/bin/env node
// Prints one value from environments.json: `node scripts/env.mjs <mode> <key>`.
// Exits non-zero when the mode or key is unknown, or the value is empty or null,
// so mise tasks never run a remote command against a missing ID.
import { readFileSync } from "node:fs";

const [mode, key] = process.argv.slice(2);
if (!mode || !key) {
  console.error("usage: node scripts/env.mjs <mode> <key>");
  process.exit(2);
}

const environments = JSON.parse(readFileSync(new URL("../environments.json", import.meta.url), "utf8"));
if (!Object.hasOwn(environments, mode)) {
  console.error(`Unknown mode "${mode}". Expected one of: ${Object.keys(environments).join(", ")}.`);
  process.exit(1);
}

const environment = environments[mode];
if (!Object.hasOwn(environment, key)) {
  console.error(`Unknown key "${key}" for mode "${mode}". Expected one of: ${Object.keys(environment).join(", ")}.`);
  process.exit(1);
}

const value = environment[key];
if (value === null) {
  console.error(`environments.json: ${mode}.${key} is null (not set for this mode).`);
  process.exit(1);
}
if (value === "") {
  console.error(`environments.json: ${mode}.${key} is empty. Fill it in before running this task.`);
  process.exit(1);
}

console.log(value);
