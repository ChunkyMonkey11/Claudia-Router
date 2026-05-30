#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { parse } from "dotenv";

const MINIMUM_NODE_MAJOR = 18;
const SMOKE_BACKEND = "nvidia";
const SMOKE_BASE_URL = "https://integrate.api.nvidia.com/v1";
const SMOKE_MODEL = "nvidia/nemotron-mini-4b-instruct";
const PLACEHOLDER_KEYS = new Set(["your_nvidia_key_here", "your_actual_key", "replace_me"]);

export async function runSetup(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const commandExists = options.commandExists ?? defaultCommandExists;
  const promptForSecret = options.promptForSecret ?? defaultPromptForSecret;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const lines = ["Claudia Router Setup", ""];

  const nodeMajor = Number.parseInt(nodeVersion.split(".")[0] ?? "", 10);
  if (!Number.isInteger(nodeMajor) || nodeMajor < MINIMUM_NODE_MAJOR) {
    lines.push(`FAIL Node.js v${nodeVersion} is unsupported`);
    lines.push(`     Install Node.js ${MINIMUM_NODE_MAJOR} or newer`);
    return setupFailure(lines);
  }
  lines.push(`OK   Node.js v${nodeVersion}`);

  if (!commandExists("claude")) {
    lines.push("FAIL Claude Code CLI was not found");
    lines.push("     Install Claude Code, then ensure `claude` is available in your PATH");
    return setupFailure(lines);
  }
  lines.push("OK   Claude Code CLI found");

  ensureFile(cwd, ".env.example", ".env", lines);
  ensureFile(cwd, "config.example.json", "config.json", lines);

  const envPath = path.join(cwd, ".env");
  const currentEnv = fs.readFileSync(envPath, "utf8");
  let apiKey = parse(currentEnv).NVIDIA_API_KEY?.trim();

  if (!isConfiguredApiKey(apiKey)) {
    if (!options.interactive && options.interactive !== undefined) {
      lines.push("FAIL NVIDIA_API_KEY is missing or still a placeholder");
      lines.push("     Run `npm run setup` in an interactive terminal");
      return setupFailure(lines);
    }

    apiKey = (await promptForSecret("Enter NVIDIA_API_KEY: ")).trim();
    if (!isConfiguredApiKey(apiKey)) {
      lines.push("FAIL NVIDIA_API_KEY was not provided");
      return setupFailure(lines);
    }

    fs.writeFileSync(envPath, setEnvValue(currentEnv, "NVIDIA_API_KEY", apiKey), {
      encoding: "utf8",
      mode: 0o600
    });
    lines.push("OK   NVIDIA_API_KEY saved to .env");
  } else {
    lines.push("OK   NVIDIA_API_KEY already configured");
  }

  lines.push(`INFO Smoke backend: ${SMOKE_BACKEND}`);
  lines.push(`INFO Smoke model:   ${SMOKE_MODEL}`);

  try {
    await runNvidiaSmokeRequest({
      apiKey,
      fetchImpl
    });
  } catch (error) {
    lines.push(`FAIL NVIDIA smoke request failed: ${getErrorMessage(error)}`);
    lines.push("     Check your NVIDIA_API_KEY and NVIDIA endpoint access, then run `npm run setup` again");
    return setupFailure(lines);
  }

  lines.push("OK   NVIDIA smoke request completed");
  lines.push("");
  lines.push("Setup complete. Start the router:");
  lines.push("npm run dev");

  return {
    exitCode: 0,
    output: `${lines.join("\n")}\n`
  };
}

function ensureFile(cwd, source, target, lines) {
  const targetPath = path.join(cwd, target);
  if (fs.existsSync(targetPath)) {
    lines.push(`OK   ${target} already exists`);
    return;
  }

  fs.copyFileSync(path.join(cwd, source), targetPath);
  lines.push(`OK   Created ${target} from ${source}`);
}

function isConfiguredApiKey(value) {
  return Boolean(value && !PLACEHOLDER_KEYS.has(value.toLowerCase()));
}

function setEnvValue(contents, name, value) {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");

  if (pattern.test(contents)) {
    return contents.replace(pattern, line);
  }

  return `${contents}${contents.endsWith("\n") || contents.length === 0 ? "" : "\n"}${line}\n`;
}

async function runNvidiaSmokeRequest({ apiKey, fetchImpl }) {
  const response = await fetchImpl(`${SMOKE_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: SMOKE_MODEL,
      messages: [
        {
          role: "user",
          content: "Reply with exactly: ok"
        }
      ],
      max_tokens: 8,
      stream: false
    })
  });
  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${truncate(bodyText)}`);
  }

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error("provider returned invalid JSON");
  }

  if (!Array.isArray(body.choices) || body.choices.length === 0) {
    throw new Error("provider response did not include a completion");
  }
}

function truncate(value) {
  if (!value) {
    return "empty response body";
  }

  return value.length > 200 ? `${value.slice(0, 200)}...` : value;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "unknown error";
}

function setupFailure(lines) {
  return {
    exitCode: 1,
    output: `${lines.join("\n")}\n`
  };
}

function defaultCommandExists(command) {
  return spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0;
}

async function defaultPromptForSecret(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("NVIDIA_API_KEY is missing. Run `npm run setup` in an interactive terminal.");
  }

  return new Promise((resolve) => {
    let value = "";
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const onData = (character) => {
      if (character === "\u0003") {
        cleanup();
        process.kill(process.pid, "SIGINT");
        return;
      }

      if (character === "\r" || character === "\n") {
        cleanup();
        process.stdout.write("\n");
        resolve(value);
        return;
      }

      if (character === "\u007f") {
        value = value.slice(0, -1);
        return;
      }

      value += character;
    };

    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };

    process.stdin.on("data", onData);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runSetup();
    process.stdout.write(result.output);
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`FAIL ${getErrorMessage(error)}\n`);
    process.exitCode = 1;
  }
}
