import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(file: string): string {
  return fs.readFileSync(path.join(repositoryRoot, file), "utf8");
}

test("README and QUICKSTART keep first-run setup paths aligned", () => {
  const readme = read("README.md");
  const quickstart = read("QUICKSTART.md");

  const requiredCommands = [
    "npm run init",
    "npm run init -- --provider local",
    "npm run init -- --provider openrouter",
    "npm run doctor",
    "npm run release:check"
  ];

  for (const command of requiredCommands) {
    assert.match(readme, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(quickstart, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("README explicitly documents current limitations", () => {
  const readme = read("README.md");

  assert.match(readme, /## Limitations/);
  assert.match(readme, /Token-by-token provider streaming passthrough/);
  assert.match(readme, /Vision/);
  assert.match(readme, /full Claude Code compatibility/i);
});
