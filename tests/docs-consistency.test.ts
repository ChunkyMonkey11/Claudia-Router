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
    "npm run quickstart",
    "npm run doctor",
    "npm run status",
    "npm run profile",
    "npm run init",
    "npm run claude:fast",
    "npm run release:check"
  ];

  const readmeOnlyCommands = [
    "npm install -g claudia-router",
    "npx claudia-router init",
    "npx claudia-router doctor",
    "npm run publish:check"
  ];

  const quickstartOnlyCommands = [
    "npm run quickstart -- --profile glm",
    "npm run init -- --provider openrouter",
    "npm run claude:qwen",
    "npm run profile -- show",
    "npm run profile -- list",
    "npm run profile -- toggle",
    "npm run init -- --provider local",
  ];

  for (const command of requiredCommands) {
    assert.match(readme, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(quickstart, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const command of readmeOnlyCommands) {
    assert.match(readme, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const command of quickstartOnlyCommands) {
    assert.match(quickstart, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("README explicitly documents current limitations", () => {
  const readme = read("README.md");

  assert.match(readme, /## Limitations/);
  assert.match(readme, /text-only today/i);
  assert.match(readme, /streaming responses/i);
  assert.match(readme, /Vision/);
  assert.match(readme, /full Claude Code compatibility/i);
});
