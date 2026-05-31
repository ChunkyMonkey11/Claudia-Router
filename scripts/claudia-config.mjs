#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";

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
  const defaultProviderKey = options.defaultProviderKey ?? "nvidia";
  const skipProviderPrompt = options.skipProviderPrompt ?? false;
  const skipConfirmation = options.skipConfirmation ?? false;
  const skipSmoke = options.skipSmoke ?? false;
  const apiKeyEnvName = options.apiKeyEnvName;
  const envPath = path.join(cwd, ".env");
  const configPath = path.join(cwd, "config.json");

  log("Claudia Router Configuration Wizard");
  log("===================================\n");

  if (fs.existsSync(envPath) || fs.existsSync(configPath)) {
    log("Existing configuration detected:");
    if (fs.existsSync(envPath)) log("  OK .env exists");
    if (fs.existsSync(configPath)) log("  OK config.json exists");

    if (!skipConfirmation) {
      const response = (await question("\nThis wizard will update your configuration. Continue? (y/N): "))
        .trim()
        .toLowerCase();
      if (response !== "y" && response !== "yes") {
        log("Aborted.");
        return 0;
      }
      log("");
    }
  }

  const providerKey = skipProviderPrompt
    ? defaultProviderKey
    : await promptProvider({ log, question, defaultProviderKey });
  const provider = PROVIDERS[providerKey];
  const apiKey = provider.requiresKey
    ? await promptApiKey({ provider, env, log, promptForSecret, apiKeyEnvName })
    : "dummy";

  if (!apiKey) {
    log("\nAborted: API key is required for this provider.");
    return 1;
  }

  log("\nGenerating configuration...");
  generateEnv(envPath, providerKey, apiKey);
  generateConfig(configPath, providerKey, provider);
  log("OK Configuration files created");

  if (!skipSmoke && (providerKey === "nvidia" || providerKey === "openrouter")) {
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

async function promptProvider({ log, question, defaultProviderKey }) {
  log(`Select your AI provider (default: ${PROVIDERS[defaultProviderKey].name}):\n`);
  const keys = Object.keys(PROVIDERS);
  for (const [index, key] of keys.entries()) {
    const provider = PROVIDERS[key];
    log(`  ${index + 1}. ${provider.name}`);
    log(`     ${provider.description}`);
    log(`     Base URL: ${provider.baseUrl}\n`);
  }

  while (true) {
    const defaultIndex = keys.indexOf(defaultProviderKey) + 1 || 1;
    const response = (await question(`(${keys.length > 0 ? `1-${keys.length}` : "1"}, default: ${defaultIndex}): `)).trim();
    if (response === "") {
      log(`Selected: ${PROVIDERS[defaultProviderKey].name} (default)`);
      return defaultProviderKey;
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

async function promptApiKey({ provider, env, log, promptForSecret, apiKeyEnvName }) {
  const sourceEnvName = apiKeyEnvName ?? provider.apiKeyEnv;
  const existingKey = env[sourceEnvName];
  if (existingKey) {
    if (sourceEnvName === provider.apiKeyEnv) {
      log(`OK   ${provider.apiKeyEnv} already configured`);
    } else {
      log(`OK   API key loaded from ${sourceEnvName}`);
    }
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
  const modelProfiles = {
    "claude-3-5-sonnet-latest": {
      backend: providerKey,
      providerModel: provider.defaultModel,
      retryAttempts: 3,
      retryBaseDelayMs: 500,
      notes: "Fast coding profile"
    },
    "claude-3-haiku-latest": {
      backend: providerKey,
      providerModel: provider.smokeModel,
      retryAttempts: 1,
      retryBaseDelayMs: 250,
      notes: "Lightweight smoke test model"
    }
  };

  if (providerKey === "nvidia") {
    modelProfiles["claude-3-5-sonnet-glm"] = {
      backend: providerKey,
      providerModel: "z-ai/glm4.7",
      retryAttempts: 3,
      retryBaseDelayMs: 500,
      extraBody: {
        chat_template_kwargs: {
          enable_thinking: true,
          clear_thinking: false
        }
      },
      notes: "Explicit GLM 4.7 profile for harder coding tasks"
    };

    modelProfiles["claude-3-5-sonnet-qwen"] = {
      backend: providerKey,
      providerModel: "qwen/qwen3.5-122b-a10b",
      retryAttempts: 3,
      retryBaseDelayMs: 500,
      notes: "Qwen fallback NVIDIA coding profile"
    };
  }

  const config = {
    port: 8082,
    defaultBackend: providerKey,
    backends: {
      [providerKey]: {
        baseUrl: provider.baseUrl,
        apiKeyEnv: provider.apiKeyEnv,
        defaultModel: provider.defaultModel
      }
    },
    modelProfiles,
    modelMap: {}
  };

  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
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
