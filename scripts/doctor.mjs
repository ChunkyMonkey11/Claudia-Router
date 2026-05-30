#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { parse } from "dotenv";

const MINIMUM_NODE_MAJOR = 18;
const PLACEHOLDER_KEYS = new Set(["your_nvidia_key_here", "your_actual_key", "replace_me"]);

export function runDoctor(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const commandExists = options.commandExists ?? defaultCommandExists;
  const lines = ["Claudia Router Doctor", ""];
  let failed = false;

  const nodeMajor = Number.parseInt(nodeVersion.split(".")[0] ?? "", 10);
  if (Number.isInteger(nodeMajor) && nodeMajor >= MINIMUM_NODE_MAJOR) {
    lines.push(`OK   Node.js v${nodeVersion}`);
  } else {
    failed = true;
    lines.push(`FAIL Node.js v${nodeVersion} is unsupported`);
    lines.push(`     Install Node.js ${MINIMUM_NODE_MAJOR} or newer`);
  }

  if (commandExists("claude")) {
    lines.push("OK   Claude Code CLI found");
  } else {
    failed = true;
    lines.push("FAIL Claude Code CLI was not found");
    lines.push("     Install Claude Code, then ensure `claude` is available in your PATH");
  }

  const envPath = path.join(cwd, ".env");
  const configPath = path.join(cwd, "config.json");
  const envExists = fs.existsSync(envPath);

  if (envExists) {
    lines.push("OK   .env found");
  } else {
    failed = true;
    lines.push("FAIL .env was not found");
    lines.push("     Run `npm run setup`");
  }

  if (fs.existsSync(configPath)) {
    lines.push("OK   config.json found");
  } else {
    failed = true;
    lines.push("FAIL config.json was not found");
    lines.push("     Run `npm run setup`");
  }

  const apiKey = envExists ? parse(fs.readFileSync(envPath, "utf8")).NVIDIA_API_KEY?.trim() : undefined;
  if (apiKey && !PLACEHOLDER_KEYS.has(apiKey.toLowerCase())) {
    lines.push("OK   NVIDIA_API_KEY is configured");
  } else {
    failed = true;
    lines.push("FAIL NVIDIA_API_KEY is missing or still a placeholder");
    lines.push("     Add `NVIDIA_API_KEY=your_key` to .env");
  }

  return {
    exitCode: failed ? 1 : 0,
    output: `${lines.join("\n")}\n`
  };
}

function defaultCommandExists(command) {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore"
  });

  return result.status === 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runDoctor();
  process.stdout.write(result.output);
  process.exitCode = result.exitCode;
}
