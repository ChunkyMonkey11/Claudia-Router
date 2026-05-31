import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runQuickstart } from "../scripts/quickstart.mjs";

function createQuickstartDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-router-quickstart-"));
  fs.writeFileSync(path.join(directory, ".env.example"), "LOCAL_API_KEY=dummy\n", "utf8");
  fs.writeFileSync(path.join(directory, "config.example.json"), "{}\n", "utf8");
  return directory;
}

test("quickstart runs setup and doctor successfully for local provider", async () => {
  const cwd = createQuickstartDirectory();

  const result = await runQuickstart({
    cwd,
    nodeVersion: "22.0.0",
    commandExists: () => true,
    providerKey: "local",
    skipConfirmation: true,
    skipSmoke: true
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /Quickstart complete\./);
  assert.match(result.output, /OK   LOCAL_API_KEY is configured/);
});

test("quickstart stops when setup fails", async () => {
  const cwd = createQuickstartDirectory();

  const result = await runQuickstart({
    cwd,
    nodeVersion: "22.0.0",
    commandExists: () => false,
    providerKey: "local"
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /FAIL Claude Code CLI was not found/);
  assert.match(result.output, /Quickstart stopped because setup failed/);
});
