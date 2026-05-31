#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { getProvider, providerName } from "./providers.mjs";

const USAGE = `Usage: claudia-router key [options]

Options:
  --provider <nvidia|openrouter|local>  Override the provider whose key should be updated
  --api-key-env <ENV_NAME>              Read the new key from an existing environment variable
  --yes                                 Skip the confirmation prompt
  -h, --help                            Show this help message
`;

export async function runKey(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const question = options.question ?? defaultQuestion;
  const promptForSecret = options.promptForSecret ?? defaultPromptForSecret;
  const envPath = path.join(cwd, ".env");
  const configPath = path.join(cwd, "config.json");
  const providerKey = options.providerKey ?? readDefaultProviderKey(configPath) ?? "nvidia";
  const provider = getProvider(providerKey);

  if (!provider) {
    return {
      exitCode: 1,
      output: `FAIL Unsupported provider: ${providerKey}\n${USAGE}`
    };
  }

  if (!provider.requiresKey) {
    return {
      exitCode: 1,
      output: [
        `FAIL ${providerName(providerKey)} does not require an API key`,
        "Use `npm run init -- --provider local` if you want to configure local models."
      ].join("\n") + "\n"
    };
  }

  const targetEnvName = provider.apiKeyEnv;
  const sourceEnvName = options.apiKeyEnvName ?? targetEnvName;
  const existingKey = fs.existsSync(envPath) ? parseEnvFile(fs.readFileSync(envPath, "utf8"))[targetEnvName] ?? "" : "";
  const providedKey = env[sourceEnvName] ?? "";

  if (providedKey) {
    if (existingKey && !options.skipConfirmation && providedKey !== existingKey) {
      const response = (await question(
        `Replace ${targetEnvName} in ${path.relative(cwd, envPath) || ".env"}? (y/N): `
      )).trim().toLowerCase();

      if (response !== "y" && response !== "yes") {
        return {
          exitCode: 0,
          output: "Aborted.\n"
        };
      }
    }
  } else if (existingKey && !options.skipConfirmation) {
    const response = (await question(
      `Replace ${targetEnvName} in ${path.relative(cwd, envPath) || ".env"}? (y/N): `
    )).trim().toLowerCase();

    if (response !== "y" && response !== "yes") {
      return {
        exitCode: 0,
        output: "Aborted.\n"
      };
    }
  }

  const key = providedKey || (await promptForSecret(`\nEnter ${targetEnvName}: `)).trim();

  if (!key) {
    return {
      exitCode: 1,
      output: `FAIL ${targetEnvName} is required\n`
    };
  }

  const updated = upsertEnvVar(fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "", targetEnvName, key);
  fs.writeFileSync(envPath, updated, { encoding: "utf8", mode: 0o600 });

  const outputLines = [
    `OK   ${targetEnvName} updated`
  ];

  if (options.apiKeyEnvName && options.apiKeyEnvName !== targetEnvName) {
    outputLines.push(`     Loaded from ${options.apiKeyEnvName}`);
  }

  outputLines.push(`     Updated ${path.relative(cwd, envPath) || ".env"}`);
  outputLines.push("     Next: run `npm run doctor` and then `npm run claude:fast`");

  return {
    exitCode: 0,
    output: `${outputLines.join("\n")}\n`
  };
}

function parseArgs(argv) {
  const options = {
    skipConfirmation: false
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

    if (arg === "--provider") {
      const value = argv[index + 1];
      if (!value) throw new Error("Missing value for --provider");
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
      if (!value) throw new Error("Missing value for --api-key-env");
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

  return { help: false, options };
}

function readDefaultProviderKey(configPath) {
  try {
    if (!fs.existsSync(configPath)) {
      return "";
    }

    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return typeof config.defaultBackend === "string" ? config.defaultBackend.trim() : "";
  } catch {
    return "";
  }
}

function upsertEnvVar(content, key, value) {
  const lines = content ? content.split(/\r?\n/) : [];
  let replaced = false;
  const nextLines = lines
    .filter((line, index, arr) => !(index === arr.length - 1 && line === ""))
    .map((line) => {
      if (line.startsWith(`${key}=`) || line.startsWith(`${key} =`)) {
        replaced = true;
        return `${key}=${value}`;
      }
      return line;
    });

  if (!replaced) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") {
      nextLines.push("");
    }
    nextLines.push(`${key}=${value}`);
  }

  return `${nextLines.join("\n")}\n`;
}

function parseEnvFile(content) {
  const result = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    result[key] = value;
  }
  return result;
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

async function defaultPromptForSecret(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("API key is missing. Run `npm run key` in an interactive terminal.");
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
    const { help, options } = parseArgs(process.argv.slice(2));
    if (help) {
      process.stdout.write(`${USAGE}\n`);
      process.exitCode = 0;
    } else {
      const result = await runKey(options);
      process.stdout.write(result.output);
      process.exitCode = result.exitCode;
    }
  } catch (error) {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  }
}
