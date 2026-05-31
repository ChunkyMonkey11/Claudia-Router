#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { parse } from "dotenv";
import { runConfigWizard } from "./claudia-config.mjs";

const MINIMUM_NODE_MAJOR = 18;

const USAGE = `Usage: claudia-router init [options]

Options:
  --provider <nvidia|openrouter|local>  Override the default NVIDIA setup
  --api-key-env <ENV_NAME>              Read the provider key from an existing environment variable
  --yes                                 Skip confirmation prompts
  --skip-smoke                          Skip the provider smoke test
  -h, --help                            Show this help message
`;

const PROVIDER_API_KEY_ENV = {
  nvidia: "NVIDIA_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  local: "LOCAL_API_KEY"
};

export async function runSetup(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const commandExists = options.commandExists ?? defaultCommandExists;
  const env = options.env ?? process.env;
  const question = options.question ?? defaultQuestion;
  const promptForSecret = options.promptForSecret ?? defaultPromptForSecret;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const providerKey = options.providerKey ?? "nvidia";
  const apiKeyEnvName = options.apiKeyEnvName;
  const skipConfirmation = options.skipConfirmation ?? false;
  const skipSmoke = options.skipSmoke ?? false;
  const lines = ["Claudia Router Setup", ""];
  const wizardLines = [];

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

  const fileEnvPath = path.join(cwd, ".env");
  const fileEnv = fs.existsSync(fileEnvPath) ? parse(fs.readFileSync(fileEnvPath, "utf8")) : {};
  const mergedEnv = {
    ...fileEnv,
    ...env
  };

  const wizardResult = await runConfigWizard({
    cwd,
    env: mergedEnv,
    log: (message) => wizardLines.push(message),
    question,
    promptForSecret,
    fetchImpl,
    defaultProviderKey: providerKey,
    providerKey,
    skipProviderPrompt: true,
    skipConfirmation,
    skipSmoke,
    apiKeyEnvName
  });

  const wizardExitCode = typeof wizardResult === "number" ? wizardResult : wizardResult.exitCode;
  const wizardOutput = `${lines.join("\n")}\n${wizardLines.join("\n")}\n`;
  if (wizardExitCode !== 0 || wizardLines.some((line) => line.includes("Aborted."))) {
    return {
      exitCode: wizardExitCode,
      output: wizardOutput
    };
  }

  const completionLines = [];
  if (!skipSmoke && (providerKey === "nvidia" || providerKey === "openrouter")) {
    completionLines.push(`OK   ${providerKey} smoke request completed`);
  }
  completionLines.push("");
  completionLines.push("Setup complete. Start the router:");
  completionLines.push("npm run dev");

  return {
    exitCode: wizardExitCode,
    output: `${wizardOutput}${completionLines.join("\n")}\n`
  };
}

function parseArgs(argv) {
  const options = {
    providerKey: "nvidia",
    skipConfirmation: false,
    skipSmoke: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      return { help: true, options: null };
    }

    if (arg === "--yes") {
      options.skipConfirmation = true;
      continue;
    }

    if (arg === "--skip-smoke") {
      options.skipSmoke = true;
      continue;
    }

    if (arg === "--provider") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --provider");
      }

      options.providerKey = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--provider=")) {
      options.providerKey = arg.slice("--provider=".length);
      continue;
    }

    if (arg === "--api-key-env") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --api-key-env");
      }

      options.apiKeyEnvName = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--api-key-env=")) {
      options.apiKeyEnvName = arg.slice("--api-key-env=".length);
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!["nvidia", "openrouter", "local"].includes(options.providerKey)) {
    throw new Error(`Unsupported provider: ${options.providerKey}`);
  }

  return { help: false, options };
}

function defaultCommandExists(command) {
  return spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0;
}

async function defaultPromptForSecret(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const providerMatch = /^Enter\s+([A-Z0-9_]+):/.exec(prompt);
    const inferredEnv = providerMatch?.[1] ?? PROVIDER_API_KEY_ENV.nvidia;
    throw new Error(`${inferredEnv} is missing. Run \`npm run init\` in an interactive terminal.`);
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

async function defaultQuestion(prompt) {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    return await readline.question(prompt);
  } finally {
    readline.close();
  }
}

function setupFailure(lines) {
  return {
    exitCode: 1,
    output: `${lines.join("\n")}\n`
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { help, options } = parseArgs(process.argv.slice(2));
    if (help) {
      process.stdout.write(`${USAGE}\n`);
      process.exitCode = 0;
    } else {
      const result = await runSetup(options);
      process.stdout.write(result.output);
      process.exitCode = result.exitCode;
    }
  } catch (error) {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  }
}
