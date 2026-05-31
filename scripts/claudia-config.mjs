#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";

const CONFIG_TEMPLATE = `{
  "port": 8082,
  "defaultBackend": "PROVIDER",
  "backends": {
    "PROVIDER": {
      "baseUrl": "BASE_URL",
      "apiKeyEnv": "API_KEY_ENV",
      "defaultModel": "DEFAULT_MODEL"
    }
  },
  "modelProfiles": {
    "claude-3-5-sonnet-latest": {
      "backend": "PROVIDER",
      "providerModel": "DEFAULT_MODEL",
      "retryAttempts": 3,
      "retryBaseDelayMs": 500,
      "notes": "Fast coding profile"
    },
    "claude-3-haiku-latest": {
      "backend": "PROVIDER",
      "providerModel": "SMOKE_MODEL",
      "retryAttempts": 1,
      "retryBaseDelayMs": 250,
      "notes": "Lightweight smoke test model"
    }
  }
}`;

const PROVIDERS = {
  nvidia: {
    name: "NVIDIA NIM",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    apiKeyEnv: "NVIDIA_API_KEY",
    defaultModel: "stepfun-ai/step-3.5-flash",
    smokeModel: "nvidia/nemotron-mini-4b-instruct",
    requiresKey: true,
    description: "Fast, high-quality models hosted by NVIDIA"
  },
  openrouter: {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    defaultModel: "qwen/qwen-2.5-coder-32b-instruct",
    smokeModel: "qwen/qwen-2.5-coder-32b-instruct",
    requiresKey: true,
    description: "Access to many models through OpenRouter"
  },
  local: {
    name: "Local (LM Studio/Ollama/etc)",
    baseUrl: "http://localhost:1234/v1",
    apiKeyEnv: "LOCAL_API_KEY",
    defaultModel: "local-model",
    smokeModel: "local-model",
    requiresKey: false,
    description: "Local models via OpenAI-compatible server"
  }
};

export async function runConfigWizard(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const log = options.log ?? console.log;
  const question = options.question ?? defaultQuestion;
  const promptForSecret = options.promptForSecret ?? defaultPromptForSecret;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const envPath = path.join(cwd, ".env");
  const configPath = path.join(cwd, "config.json");

  log("Claudia Router Configuration Wizard");
  log("===================================\n");

  if (fs.existsSync(envPath) || fs.existsSync(configPath)) {
    log("Existing configuration detected:");
    if (fs.existsSync(envPath)) log("  OK .env exists");
    if (fs.existsSync(configPath)) log("  OK config.json exists");

    const response = (await question("\nThis wizard will update your configuration. Continue? (y/N): "))
      .trim()
      .toLowerCase();
    if (response !== "y" && response !== "yes") {
      log("Aborted.");
      return 0;
    }
    log("");
  }

  const providerKey = await promptProvider({ log, question });
  const provider = PROVIDERS[providerKey];
  const apiKey = provider.requiresKey
    ? await promptApiKey({ provider, env, promptForSecret })
    : "dummy";

  if (!apiKey) {
    log("\nAborted: API key is required for this provider.");
    return 1;
  }

  log("\nGenerating configuration...");
  generateEnv(envPath, providerKey, apiKey);
  generateConfig(configPath, providerKey, provider);
  log("OK Configuration files created");

  if (providerKey === "nvidia" || providerKey === "openrouter") {
    await testConnectivity({
      baseUrl: provider.baseUrl,
      apiKey,
      model: provider.smokeModel,
      providerName: providerKey,
      fetchImpl,
      log
    });
  }

  log("\nNext steps:");
  log("  1. Review and adjust modelProfiles in config.json if needed");
  log("  2. Start the router: npm run dev");
  log("  3. Test with: curl http://localhost:8082/health");
  log("  4. Use Claude: npm run claude:fast (or run npm link once for claudia-claude)");
  log("\nConfiguration complete!");
  return 0;
}

async function promptProvider({ log, question }) {
  log("Select your AI provider:\n");
  const keys = Object.keys(PROVIDERS);
  for (const [index, key] of keys.entries()) {
    const provider = PROVIDERS[key];
    log(`  ${index + 1}. ${provider.name}`);
    log(`     ${provider.description}`);
    log(`     Base URL: ${provider.baseUrl}\n`);
  }

  while (true) {
    const response = (await question("(1-3, default: 1): ")).trim();
    if (response === "") {
      log("Selected: NVIDIA NIM (default)");
      return "nvidia";
    }

    const index = Number.parseInt(response, 10) - 1;
    if (Number.isInteger(index) && index >= 0 && index < keys.length) {
      const selected = keys[index];
      log(`Selected: ${PROVIDERS[selected].name}`);
      return selected;
    }

    log("Invalid choice. Please enter a number 1-3.");
  }
}

async function promptApiKey({ provider, env, promptForSecret }) {
  const existingKey = env[provider.apiKeyEnv];
  if (existingKey) {
    return existingKey;
  }

  return (await promptForSecret(`\nEnter ${provider.apiKeyEnv}: `)).trim();
}

function generateEnv(envPath, providerKey, apiKey) {
  const envContent = `# Claudia Router Environment Configuration
# Generated by claudia-config

# Provider API Key
${PROVIDERS[providerKey].apiKeyEnv}=${apiKey}

# Optional: Override config location
# CLAUDIA_CONFIG=./config.json

# Optional: Logging level (trace, debug, info, warn, error, fatal)
# LOG_LEVEL=info
`;
  fs.writeFileSync(envPath, envContent, { encoding: "utf8", mode: 0o600 });
}

function generateConfig(configPath, providerKey, provider) {
  const config = CONFIG_TEMPLATE
    .replace(/PROVIDER/g, providerKey)
    .replace(/BASE_URL/g, provider.baseUrl)
    .replace(/API_KEY_ENV/g, provider.apiKeyEnv)
    .replace(/DEFAULT_MODEL/g, provider.defaultModel)
    .replace(/SMOKE_MODEL/g, provider.smokeModel);
  fs.writeFileSync(configPath, config, "utf8");
}

async function testConnectivity({ baseUrl, apiKey, model, providerName, fetchImpl, log }) {
  log("\nTesting connectivity...");
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5,
        stream: false
      })
    });

    if (response.ok) {
      log(`OK Connected to ${providerName} successfully`);
    } else {
      log(`WARN Connection test failed: HTTP ${response.status}`);
      log(`     Your API key may be invalid or you may not have access to ${model}`);
    }
  } catch (error) {
    log(`WARN Could not test connectivity: ${getErrorMessage(error)}`);
    log("     You can test manually later with: npm run doctor");
  }
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
    throw new Error("API key is missing. Run `npm run config` in an interactive terminal.");
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

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "unknown error";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await runConfigWizard();
  } catch (error) {
    console.error(`FAIL ${getErrorMessage(error)}`);
    process.exitCode = 1;
  }
}
