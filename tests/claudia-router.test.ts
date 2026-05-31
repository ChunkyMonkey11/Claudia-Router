import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repositoryRoot, "scripts", "claudia-router.mjs");

test("router CLI reports the package version", () => {
  const result = spawnSync(process.execPath, [cliPath, "version"], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Claudia Router v0\.1\.0/);
});

test("router CLI can delegate to the doctor command in ESM mode", () => {
  const result = spawnSync(process.execPath, [cliPath, "doctor"], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });

  assert.match(result.stdout, /Claudia Router Doctor/);
  assert.doesNotMatch(result.stderr, /__dirname is not defined/);
});

test("router CLI help includes init as the first-run path", () => {
  const result = spawnSync(process.execPath, [cliPath, "--help"], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /\binit\b/);
  assert.match(result.stdout, /\bquickstart\b/);
  assert.match(result.stdout, /\bprofile\b/);
  assert.match(result.stdout, /\bkey\b/);
  assert.match(result.stdout, /\bstatus\b/);
  assert.match(result.stdout, /Run the setup flow for supported providers/);
});
