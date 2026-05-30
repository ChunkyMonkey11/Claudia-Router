import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const wrapperPath = path.resolve("scripts/claudia-claude.mjs");

function createFakeClaudeDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-router-wrapper-"));
  const executable = path.join(directory, "claude");
  fs.writeFileSync(
    executable,
    `#!${process.execPath}
console.log(JSON.stringify({
  args: process.argv.slice(2),
  baseUrl: process.env.ANTHROPIC_BASE_URL,
  model: process.env.ANTHROPIC_MODEL,
  authToken: process.env.ANTHROPIC_AUTH_TOKEN
}));
`,
    {
      encoding: "utf8",
      mode: 0o755
    }
  );
  return directory;
}

test("wrapper launches Claude without a dummy token for managed-login users", () => {
  const result = spawnSync(process.execPath, [wrapperPath], {
    encoding: "utf8",
    env: {
      PATH: createFakeClaudeDirectory()
    }
  });
  const output = JSON.parse(result.stdout) as Record<string, unknown>;

  assert.equal(result.status, 0);
  assert.deepEqual(output.args, ["--model", "claude-3-5-sonnet-latest"]);
  assert.equal(output.baseUrl, "http://localhost:8082");
  assert.equal(output.model, "claude-3-5-sonnet-latest");
  assert.equal(output.authToken, undefined);
});

test("wrapper enables local dummy auth and keeps explicit model selection consistent", () => {
  const result = spawnSync(
    process.execPath,
    [wrapperPath, "--local-auth", "--model", "claude-3-5-sonnet-glm"],
    {
      encoding: "utf8",
      env: {
        PATH: createFakeClaudeDirectory()
      }
    }
  );
  const output = JSON.parse(result.stdout) as Record<string, unknown>;

  assert.equal(result.status, 0);
  assert.deepEqual(output.args, ["--model", "claude-3-5-sonnet-glm"]);
  assert.equal(output.model, "claude-3-5-sonnet-glm");
  assert.equal(output.authToken, "dummy");
  assert.match(result.stderr, /Claudia Router local auth enabled/);
});

test("wrapper prints a helpful error when Claude Code is missing", () => {
  const result = spawnSync(process.execPath, [wrapperPath], {
    encoding: "utf8",
    env: {
      PATH: fs.mkdtempSync(path.join(os.tmpdir(), "claudia-router-empty-path-"))
    }
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Could not find the Claude Code CLI/);
});
