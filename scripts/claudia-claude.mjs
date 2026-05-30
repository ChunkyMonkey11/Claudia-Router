#!/usr/bin/env node
import { spawn } from "node:child_process";
import { buildClaudeEnv, buildClaudeArgs } from "./claude-wrapper.module.mjs";

const args = process.argv.slice(2);
const model = process.env.CLAUDIA_CLAUDE_MODEL ?? "claude-3-5-sonnet-latest";

const claudeArgs = buildClaudeArgs(args, model);
const env = buildClaudeEnv(process.env, model, args);

if (env.ANTHROPIC_AUTH_TOKEN === "dummy" && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.error("Claudia Router local auth enabled. Using a dummy token for the local router.");
}

const child = spawn("claude", claudeArgs, {
  stdio: "inherit",
  env
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
