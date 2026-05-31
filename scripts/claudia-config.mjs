#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { parse } from "dotenv";
import { spawnSync } from "node:child_process";

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

// Provider presets
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

function main() {
  const cwd = process.cwd();
  console.log("Claudia Router Configuration Wizard");
  console.log("===================================\n");

  // Check existing config
  const envPath = path.join(cwd, ".env");
  const configPath = path.join(cwd, "config.json");
  const envExists = fs.existsSync(envPath);
  const configExists = fs.existsSync(configPath);

  if (envExists || configExists) {
    console.log("Existing configuration detected:");
    if (envExists) console.log("  ✓ .env exists");
    if (configExists) console.log("  ✓ config.json exists");
    console.log("\nThis wizard will update your configuration. Continue? (y/N): ", { end: "" });
    const response = fs.readFileSync(0, "utf8").trim().toLowerCase();
    if (response !== "y" && response !== "yes") {
      console.log("Aborted.");
      process.exit(0);
    }
    console.log();
  }

  // Step 1: Choose provider
  const providerKey = promptProvider();
  const provider = PROVIDERS[providerKey];

  // Step 2: Get API key if needed
  let apiKey = null;
  if (provider.requiresKey) {
    apiKey = promptApiKey(provider);
    if (!apiKey) {
      console.error("\nAborted: API key is required for this provider.");
      process.exit(1);
    }
  } else {
    apiKey = "dummy";
  }

  // Step 3: Generate configuration
  console.log("\nGenerating configuration...");
  generateEnv(envPath, providerKey, apiKey);
  generateConfig(configPath, providerKey, provider);
  console.log("✓ Configuration files created");

  // Step 4: Test connectivity
  if (providerKey === "nvidia" || providerKey === "openrouter") {
    testConnectivity(provider.baseUrl, apiKey, provider.smokeModel, providerKey);
  }

  // Step 5: Next steps
  console.log("\nNext steps:");
  console.log("  1. Review and adjust modelProfiles in config.json if needed");
  console.log("  2. Start the router: npm run dev");
  console.log("  3. Test with: curl http://localhost:8082/health");
  console.log("  4. Use Claude: npm run claude:fast (or claudia-claude)");
  console.log("\nConfiguration complete!");
}

function promptProvider() {
  console.log("Select your AI provider:");
  console.log();
  const keys = Object.keys(PROVIDERS);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const p = PROVIDERS[key];
    console.log(`  ${i + 1}. ${p.name}`);
    console.log(`     ${p.description}`);
    console.log(`     Base URL: ${p.baseUrl}`);
    console.log();
  }

  while (true) {
    console.log("(1-3, default: 1): ", { end: "" });
    const response = fs.readFileSync(0, "utf8").trim();
    const num = Number.parseInt(response, 10);

    if (response === "" || isNaN(num)) {
      console.log("Selected: NVIDIA (default)");
      return "nvidia";
    }

    if (num >= 1 && num <= keys.length) {
      const selected = keys[num - 1];
      console.log(`Selected: ${PROVIDERS[selected].name}`);
      return selected;
    }

    console.log("Invalid choice. Please enter a number 1-3.");
  }
}

function promptApiKey(provider) {
  console.log(`\nEnter your ${provider.name} API key:`);
  if (!process.stdin.isTTY) {
    // Non-interactive: read from environment or error
    const envKey = process.env[provider.apiKeyEnv];
    if (envKey) {
      console.log("(using value from environment)");
      return envKey;
    }
    console.error(`\nError: ${provider.apiKeyEnv} is required.`);
    console.error(`Set it via environment variable or run in interactive mode.`);
    process.exit(1);
  }

  return promptSecret(`${provider.apiKeyEnv}=`);
}

function promptSecret(prompt) {
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  let value = "";

  return new Promise((resolve) => {
    const onData = (character) => {
      if (character === "") {
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

      if (character === "") {
        value = value.slice(0, -1);
        process.stdout.write("\b \b");
        return;
      }

      value += character;
      process.stdout.write("*");
    };

    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };

    process.stdin.on("data", onData);
  });
}

function generateEnv(path, providerKey, apiKey) {
  const envContent = `# Claudia Router Environment Configuration
# Generated by claudia-config

# Provider API Key
${PROVIDERS[providerKey].apiKeyEnv}=${apiKey}

# Optional: Override config location
# CLAUDIA_CONFIG=./config.json

# Optional: Logging level (trace, debug, info, warn, error, fatal)
# LOG_LEVEL=info
`;
  fs.writeFileSync(path, envContent, "utf8");
  fs.chmodSync(path, 0o600);
}

function generateConfig(path, providerKey, provider) {
  const config = CONFIG_TEMPLATE
    .replace(/PROVIDER/g, providerKey)
    .replace(/BASE_URL/g, provider.baseUrl)
    .replace(/API_KEY_ENV/g, provider.apiKeyEnv)
    .replace(/DEFAULT_MODEL/g, provider.defaultModel)
    .replace(/SMOKE_MODEL/g, provider.smokeModel);
  fs.writeFileSync(path, config, "utf8");
}

function testConnectivity(baseUrl, apiKey, model, providerName) {
  console.log("\nTesting connectivity...");
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;

  try {
    const response = globalThis.fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5,
        stream: false
      })
    });

    if (response.ok) {
      console.log(`✓ Connected to ${providerName} successfully`);
    } else {
      console.log(`⚠ Connection test failed: HTTP ${response.status}`);
      console.log(`  Your API key may be invalid or you may not have access to ${model}`);
    }
  } catch (error) {
    console.log(`⚠ Could not test connectivity: ${error.message}`);
    console.log("  You can test manually later with: npm run doctor");
  }
}

main();
