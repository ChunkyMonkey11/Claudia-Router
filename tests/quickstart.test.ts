import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runQuickstart } from "../scripts/quickstart.mjs";

function createQuickstartDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-router-quickstart-"));
  fs.writeFileSync(
    path.join(directory, ".env.example"),
    "LOCAL_API_KEY=dummy\n",
    "utf8"
  );
  fs.writeFileSync(path.join(directory, "config.example.json"), "{}", "utf8");
  return directory;
}

test("quickstart can set a profile after setup and doctor complete", async () => {
  const cwd = createQuickstartDirectory();
  const result = await runQuickstart({
    cwd,
    nodeVersion: "22.0.0",
    commandExists: () => true,
    providerKey: "local",
    skipConfirmation: true,
    skipSmoke: true,
    profileName: "glm"
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /Quickstart complete\./);
  assert.match(result.output, /Applying profile\.\.\./);
  assert.match(result.output, /Active profile set to glm/);
  assert.match(fs.readFileSync(path.join(cwd, ".env"), "utf8"), /CLAUDIA_CLAUDE_MODEL=claude-3-5-sonnet-glm/);
});

test("quickstart rejects unsupported profile names", async () => {
  const result = await runQuickstart({
    cwd: createQuickstartDirectory(),
    nodeVersion: "22.0.0",
    commandExists: () => true,
    providerKey: "local",
    skipConfirmation: true,
    skipSmoke: true,
    profileName: "banana"
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /Unsupported profile: banana/);
});
