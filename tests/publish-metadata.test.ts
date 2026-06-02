import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(file: string) {
  return JSON.parse(fs.readFileSync(path.join(repositoryRoot, file), "utf8"));
}

function readText(file: string) {
  return fs.readFileSync(path.join(repositoryRoot, file), "utf8");
}

test("package metadata is ready for npm publish", () => {
  const pkg = readJson("package.json");

  assert.equal(pkg.preferGlobal, true);
  assert.deepEqual(pkg.publishConfig, {
    access: "public",
    tag: "latest"
  });
  assert.equal(pkg.scripts.prepublishOnly, "npm run build");
  assert.equal(pkg.scripts["publish:check"], "npm run release:check && npm pack --dry-run");
  assert.equal(pkg.bin["claudia-router"], "scripts/claudia-router.mjs");
  assert.equal(pkg.bin["claudia-claude"], "scripts/claudia-claude.mjs");
  assert.equal(pkg.bin["claudia-config"], "scripts/claudia-config.mjs");

  for (const expectedFile of [".env.example", "LICENSE", "README.md", "config.example.json", "dist", "scripts"]) {
    assert.ok(pkg.files.includes(expectedFile), `Expected ${expectedFile} in package files`);
  }
});

test("README documents the npm install path for published builds", () => {
  const readme = readText("README.md");

  assert.match(readme, /npm install -g claudia-router/);
  assert.match(readme, /npx claudia-router init/);
  assert.match(readme, /npx claudia-router doctor/);
  assert.match(readme, /npm publish/);
  assert.match(readme, /npm run publish:check/);
});
