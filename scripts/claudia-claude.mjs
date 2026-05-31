#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { buildClaudeEnv, buildClaudeArgs, resolveClaudeModel } from "./claude-wrapper.module.mjs";

const args = process.argv.slice(2);
const defaultModel = process.env.CLAUDIA_CLAUDE_MODEL ?? "claude-3-5-sonnet-latest";

// Handle special commands
if (args.includes("models")) {
  printModels();
  process.exit(0);
}

if (args.includes("--verbose") || args.includes("-v")) {
  printVerboseInfo(args, defaultModel);
}

const claudeArgs = buildClaudeArgs(args, defaultModel);
const resolvedModel = resolveClaudeModel(args, defaultModel);
const env = buildClaudeEnv(process.env, defaultModel, args);

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

function printVerboseInfo(args, defaultModel) {
  const claudeArgs = buildClaudeArgs(args, defaultModel);
  const resolvedModel = resolveClaudeModel(args, defaultModel);
  const env = buildClaudeEnv(process.env, defaultModel, args);

  console.log("\n🔧 Claudia Router Configuration");
  console.log("================================");
  console.log(`Router URL:       ${env.ANTHROPIC_BASE_URL ?? "http://localhost:8082"}`);
  console.log(`Claude Model:     ${env.ANTHROPIC_MODEL ?? resolvedModel ?? defaultModel}`);
  console.log(
    `Auth:             ${env.ANTHROPIC_AUTH_TOKEN === "dummy" ? "local auth (dummy token)" : "managed login"}`
  );

  // Try to load config to show backend mapping
  try {
    const configPath = process.env.CLAUDIA_CONFIG ?? path.resolve(process.cwd(), "config.json");
    if (existsSync(configPath)) {
      const configJson = JSON.parse(require("fs").readFileSync(configPath, "utf8"));
      const profile = configJson.modelProfiles?.[env.ANTHROPIC_MODEL] ||
                     configJson.modelMap?.[env.ANTHROPIC_MODEL];
      if (profile) {
        const backend = configJson.backends[profile.backend];
        console.log(`\n📡 Backend Routing`);
        console.log(`Backend:          ${profile.backend}`);
        console.log(`Provider Model:   ${profile.providerModel || profile.model}`);
        console.log(`Base URL:         ${backend?.baseUrl}`);
        if (profile.retryAttempts !== undefined) {
          console.log(`Retries:          ${profile.retryAttempts}`);
        }
      }
    }
  } catch (error) {
    // Silently ignore config loading errors in verbose mode
  }

  console.log("\n🚀 Starting Claude Code...\n");
}

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

By default the wrapper uses local auth so NVIDIA-only users can run it immediately.
Use --managed-auth if you want Claude Code managed login instead.

`);
}
