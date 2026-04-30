#!/usr/bin/env node
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const hasModelArg = args.some((arg, index) => arg === "--model" || arg.startsWith("--model=") || args[index - 1] === "--model");
const model = process.env.CLAUDIA_CLAUDE_MODEL ?? "claude-3-5-sonnet-latest";

const claudeArgs = hasModelArg ? args : ["--model", model, ...args];

const child = spawn("claude", claudeArgs, {
  stdio: "inherit",
  env: {
    ...process.env,
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL ?? "http://localhost:8082",
    ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ?? "dummy",
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL ?? model,
    ANTHROPIC_DEFAULT_SONNET_MODEL:
      process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? "claude-3-5-sonnet-latest",
    ANTHROPIC_DEFAULT_HAIKU_MODEL:
      process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? "claude-3-haiku-latest"
  }
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on("error", (error) => {
  if ("code" in error && error.code === "ENOENT") {
    console.error("Could not find the Claude Code CLI. Install it first, then rerun claudia-claude.");
  } else {
    console.error(error);
  }

  process.exit(1);
});
