import assert from "node:assert/strict";
import test from "node:test";
import { buildClaudeEnv, buildClaudeArgs, resolveClaudeModel } from "../scripts/claude-wrapper.module.mjs";

test("buildClaudeEnv: sets default base URL without dummy auth token", () => {
  const env = buildClaudeEnv({});

  assert.equal(env.ANTHROPIC_BASE_URL, "http://localhost:8082");
  assert.equal(env.ANTHROPIC_DEFAULT_SONNET_MODEL, "claude-3-5-sonnet-latest");
  assert.equal(env.ANTHROPIC_DEFAULT_HAIKU_MODEL, "claude-3-haiku-latest");
  assert.equal(env.ANTHROPIC_MODEL, "claude-3-5-sonnet-latest");
  // Should NOT set ANTHROPIC_AUTH_TOKEN
  assert.strictEqual(env.ANTHROPIC_AUTH_TOKEN, undefined);
});

test("buildClaudeEnv: respects user-provided ANTHROPIC_BASE_URL", () => {
  const env = buildClaudeEnv({
    ANTHROPIC_BASE_URL: "http://custom:8080"
  });

  assert.equal(env.ANTHROPIC_BASE_URL, "http://custom:8080");
  assert.equal(env.ANTHROPIC_MODEL, "claude-3-5-sonnet-latest");
});

test("buildClaudeEnv: preserves user-provided ANTHROPIC_AUTH_TOKEN", () => {
  const env = buildClaudeEnv({
    ANTHROPIC_AUTH_TOKEN: "sk-user-token-123"
  });

  assert.equal(env.ANTHROPIC_AUTH_TOKEN, "sk-user-token-123");
});

test("buildClaudeEnv: sets dummy auth token only when local auth is requested", () => {
  assert.equal(buildClaudeEnv({}, undefined, ["--local-auth"]).ANTHROPIC_AUTH_TOKEN, "dummy");
  assert.equal(buildClaudeEnv({ CLAUDIA_LOCAL_AUTH: "1" }).ANTHROPIC_AUTH_TOKEN, "dummy");
});

test("buildClaudeEnv: does NOT set dummy auth token when none provided", () => {
  const env = buildClaudeEnv({});

  assert.strictEqual(env.ANTHROPIC_AUTH_TOKEN, undefined);
});

test("buildClaudeEnv: respects CLAUDIA_CLAUDE_MODEL override", () => {
  const env = buildClaudeEnv({
    CLAUDIA_CLAUDE_MODEL: "claude-opus-4"
  });

  assert.equal(env.ANTHROPIC_MODEL, "claude-opus-4");
});

test("buildClaudeEnv: args defaultModel overrides built-in default", () => {
  const env = buildClaudeEnv({}, "claude-3-5-sonnet-glm");

  assert.equal(env.ANTHROPIC_MODEL, "claude-3-5-sonnet-glm");
});

test("buildClaudeEnv: CLAUDIA_CLAUDE_MODEL takes precedence over args default", () => {
  const env = buildClaudeEnv({
    CLAUDIA_CLAUDE_MODEL: "claude-3-5-sonnet-glm"
  }, "claude-3-haiku-latest");

  assert.equal(env.ANTHROPIC_MODEL, "claude-3-5-sonnet-glm");
});

test("buildClaudeEnv: explicit CLI model takes precedence over environment defaults", () => {
  const env = buildClaudeEnv(
    {
      CLAUDIA_CLAUDE_MODEL: "claude-3-haiku-latest"
    },
    "claude-3-5-sonnet-latest",
    ["--model", "claude-3-5-sonnet-glm"]
  );

  assert.equal(env.ANTHROPIC_MODEL, "claude-3-5-sonnet-glm");
});

test("buildClaudeEnv: preserves other user env vars", () => {
  const originalEnv = {
    PATH: "/usr/bin",
    OTHER_VAR: "value"
  };
  const env = buildClaudeEnv(originalEnv);

  assert.equal(env.PATH, "/usr/bin");
  assert.equal(env.OTHER_VAR, "value");
});

test("buildClaudeArgs: returns [-i] for interactive mode with no args", () => {
  const args = buildClaudeArgs([], "claude-3-5-sonnet-latest", { isTTY: true });

  // Interactive mode: -i flag, no --model
  assert.deepEqual(args, ["-i"]);
});

test("buildClaudeArgs: adds default model with other args", () => {
  const args = buildClaudeArgs(["--verbose", "project/"], "claude-opus-4", { isTTY: false });

  assert.deepEqual(args, ["--model", "claude-opus-4", "--verbose", "project/"]);
});

test("buildClaudeArgs: respects explicit --model as separate flag", () => {
  const args = buildClaudeArgs(["--model", "custom-model"], "default-model", { isTTY: false });

  assert.deepEqual(args, ["--model", "custom-model"]);
});

test("buildClaudeArgs: respects explicit --model=combined flag", () => {
  const args = buildClaudeArgs(["--model=custom-model", "--yes"], "default-model", { isTTY: false });

  assert.deepEqual(args, ["--model=custom-model", "--yes"]);
});

test("buildClaudeArgs: detects --model in any position", () => {
  const args1 = buildClaudeArgs(["--verbose", "--model", "custom"], "default", { isTTY: false });
  assert.deepEqual(args1, ["--verbose", "--model", "custom"]);

  const args2 = buildClaudeArgs(["--model=custom", "--verbose"], "default", { isTTY: false });
  assert.deepEqual(args2, ["--model=custom", "--verbose"]);
});

test("buildClaudeArgs: doesn't duplicate --model if already present", () => {
  const args = buildClaudeArgs(["--model=custom", "dir"], "default-model", { isTTY: false });

  assert.equal(args[0], "--model=custom");
  assert.equal(args.slice(1).includes("--model"), false);
});

test("buildClaudeArgs: removes wrapper-only --local-auth flag", () => {
  const args = buildClaudeArgs(["--local-auth", "--verbose"], "default-model", { isTTY: false });

  assert.deepEqual(args, ["--model", "default-model", "--verbose"]);
});

test("resolveClaudeModel: reads separate and combined CLI model flags", () => {
  assert.equal(resolveClaudeModel(["--model", "separate-model"], "default"), "separate-model");
  assert.equal(resolveClaudeModel(["--model=combined-model"], "default"), "combined-model");
  assert.equal(resolveClaudeModel([], "default"), "default");
});
