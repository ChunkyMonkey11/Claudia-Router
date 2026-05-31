import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runProfile } from "../scripts/profile.mjs";

function createProfileDirectory(env = ""): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-router-profile-"));
  if (env) {
    fs.writeFileSync(path.join(directory, ".env"), env, "utf8");
  }
  return directory;
}

test("profile show reports unset state when CLAUDIA_CLAUDE_MODEL is missing", () => {
  const result = runProfile({
    cwd: createProfileDirectory()
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /Active profile: not set/);
});

test("profile command sets the active fast profile in .env", () => {
  const cwd = createProfileDirectory("NVIDIA_API_KEY=test-key\n");
  const result = runProfile({
    cwd,
    profileName: "fast"
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /Active profile set to fast/);
  assert.match(fs.readFileSync(path.join(cwd, ".env"), "utf8"), /CLAUDIA_CLAUDE_MODEL=claude-3-5-sonnet-latest/);
});

test("profile list shows the available presets", () => {
  const cwd = createProfileDirectory("CLAUDIA_CLAUDE_MODEL=claude-3-5-sonnet-glm\n");
  const result = runProfile({
    cwd,
    profileName: "list"
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /Available profiles:/);
  assert.match(result.output, /\* glm -> claude-3-5-sonnet-glm/);
  assert.match(result.output, /toggle/i);
});

test("profile toggle flips between fast and glm", () => {
  const cwd = createProfileDirectory("CLAUDIA_CLAUDE_MODEL=claude-3-5-sonnet-latest\n");
  const result = runProfile({
    cwd,
    profileName: "toggle"
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /Active profile set to glm/);
  assert.match(fs.readFileSync(path.join(cwd, ".env"), "utf8"), /CLAUDIA_CLAUDE_MODEL=claude-3-5-sonnet-glm/);
});

test("profile command rejects unsupported profiles", () => {
  const result = runProfile({
    cwd: createProfileDirectory(),
    profileName: "banana"
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /Unsupported profile: banana/);
});
