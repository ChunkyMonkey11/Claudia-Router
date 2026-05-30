#!/usr/bin/env node
import { spawn } from "node:child_process";
import { buildClaudeEnv, buildClaudeArgs, resolveClaudeModel } from "./claude-wrapper.module.mjs";

const args = process.argv.slice(2);
const defaultModel = process.env.CLAUDIA_CLAUDE_MODEL ?? "claude-3-5-sonnet-latest";

// Handle 'models' command specially
if (args.includes("models")) {
  printModels();
  process.exit(0);
}

const claudeArgs = buildClaudeArgs(args, defaultModel);
const resolvedModel = resolveClaudeModel(args, defaultModel);
const env = buildClaudeEnv(process.env, defaultModel, args);

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

function printModels() {
  console.log(`
Claudia Router Model Profiles
=============================

Shortcuts (use with --model or in npm scripts):

  --model fast     Fast coding: stepfun-ai/step-3.5-flash (NVIDIA)
  --model glm      High-quality: z-ai/glm4.7 with thinking (NVIDIA)
  --model qwen     Fallback: qwen/qwen3.5-122b-a10b (NVIDIA)
  --model smoke    Lightweight: nvidia/nemotron-mini-4b-instruct (NVIDIA)

Built-in npm scripts:

  npm run claude:fast   (uses --model fast)
  npm run claude:glm    (uses --model glm)
  npm run claude:smoke  (uses --model smoke)

Any model name is also accepted via --model. Use --local-auth when not logged into Claude Code.

`);
}
