#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { getProfileAlias, getProfileNextCommand } from "./presets.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

const COMMANDS = {
  init: {
    description: "Run the setup flow for supported providers",
    script: "setup.mjs"
  },
  quickstart: {
    description: "Run setup + doctor in one command",
    script: "quickstart.mjs"
  },
  profile: {
    description: "Switch the active Claude profile",
    script: "profile.mjs"
  },
  key: {
    description: "Update a provider API key in .env",
    script: "key.mjs"
  },
  doctor: {
    description: "Run system and configuration checks",
    script: "doctor.mjs"
  },
  status: {
    description: "Check if the router is running",
    script: null // handled inline
  },
  config: {
    description: "Run the configuration wizard",
    script: "claudia-config.mjs"
  },
  version: {
    description: "Show version",
    script: null
  }
};

const USAGE = `Usage: claudia-router <command>

Commands:
  init       Run the setup flow for supported providers
  quickstart Run setup + doctor in one command
  profile    Switch the active Claude profile
  key        Update a provider API key in .env
  doctor     Run system and configuration checks
  status     Check if the router is running
  config     Run the interactive configuration wizard
  version    Show version

Run "claudia-router <command> --help" for command-specific help.
`;

function main() {
  const command = process.argv[2];

  if (!command || command === "--help" || command === "-h") {
    console.log(USAGE);
    process.exit(0);
  }

  const cmd = COMMANDS[command];
  if (!cmd) {
    console.error(`Error: Unknown command "${command}"`);
    console.error(`\nAvailable commands: ${Object.keys(COMMANDS).join(", ")}`);
    process.exit(1);
  }

  if (command === "status") {
    handleStatus();
  } else if (command === "version") {
    handleVersion();
  } else if (cmd.script) {
    handleChild(command, cmd.script);
  }
}

async function handleStatus() {
  const cwd = process.cwd();
  const envPath = path.resolve(cwd, ".env");
  const configPath = path.resolve(cwd, "config.json");
  const profileEnv = readEnvValue(envPath, "CLAUDIA_CLAUDE_MODEL");

  // Try to read the config to determine the port and routing summary
  let port = 8082;
  let configSummary = null;
  try {
    if (fs.existsSync(configPath)) {
      const configJson = JSON.parse(fs.readFileSync(configPath, "utf8"));
      port = configJson.port ?? 8082;
      configSummary = buildConfigSummary(configJson, profileEnv);
    }
  } catch {
    // Use default port
  }

  if (!configSummary) {
    configSummary = buildFallbackSummary(profileEnv);
  }

  console.log(`Active profile: ${configSummary.profileLabel}`);
  if (configSummary.modelAlias) {
    console.log(`  Model alias: ${configSummary.modelAlias}`);
  }
  if (configSummary.backendName) {
    console.log(`  Backend: ${configSummary.backendName}`);
  }
  if (configSummary.providerModel) {
    console.log(`  Provider model: ${configSummary.providerModel}`);
  }
  if (configSummary.defaultBackend) {
    console.log(`  Config default backend: ${configSummary.defaultBackend}`);
  }
  console.log(`  Router port: ${port}`);

  let portListening = false;
  try {
    const { execSync } = await import("child_process");
    execSync(`lsof -i :${port}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    portListening = true;
  } catch {
    // lsof not available or port not listening
  }

  if (!portListening) {
    console.log(`✗ Router is NOT running on port ${port}`);
    console.log(`  To start it, run: npm run dev`);
    console.log(`Next: run \`npm run dev\``);
    process.exit(1);
    return;
  }

  // Port is listening, try health endpoint
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await globalThis.fetch(`http://localhost:${port}/health`, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      console.log(`✓ Router is running on port ${port}`);
      console.log(`  Name: ${data.name}`);
      console.log(`  Version: ${data.version}`);
      if (data.uptime_seconds) {
        console.log(`  Uptime: ${data.uptime_seconds.toFixed(1)}s`);
      }
      console.log(`Next: ${getStatusNextAction(configSummary)}`);
      process.exit(0);
      return;
    }
  } catch {
    // Health check failed, but port is listening - still report as running
  }

  console.log(`✓ Router is running on port ${port} (port is listening)`);
  console.log(`Next: ${getStatusNextAction(configSummary)}`);
  process.exit(0);
}

function readEnvValue(envPath, key) {
  try {
    if (!fs.existsSync(envPath)) {
      return "";
    }

    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const entryKey = trimmed.slice(0, index).trim();
      if (entryKey !== key) continue;
      return trimmed.slice(index + 1).trim();
    }
  } catch {
    return "";
  }

  return "";
}

function buildFallbackSummary(profileEnv) {
  return {
    profileLabel: profileEnv || "not set",
    modelAlias: profileEnv || "",
    backendName: "",
    providerModel: "",
    defaultBackend: ""
  };
}

function buildConfigSummary(configJson, profileEnv) {
  const activeModel = profileEnv || "";
  const modelProfile = activeModel ? configJson.modelProfiles?.[activeModel] : null;
  const legacyMap = activeModel ? configJson.modelMap?.[activeModel] : null;
  const backendName =
    modelProfile?.backend ?? legacyMap?.backend ?? configJson.defaultBackend ?? "";
  const backend = backendName ? configJson.backends?.[backendName] : null;
  const providerModel =
    modelProfile?.providerModel ?? modelProfile?.model ?? legacyMap?.model ?? backend?.defaultModel ?? "";
  const alias = getProfileAlias(activeModel);

  return {
    profileLabel: alias ? `${alias} (${activeModel})` : activeModel || "not set",
    modelAlias: activeModel,
    backendName,
    providerModel,
    defaultBackend: configJson.defaultBackend ?? ""
  };
}

function getStatusNextAction(summary) {
  const alias = summary.modelAlias ? getProfileAlias(summary.modelAlias) : "";

  if (!summary.modelAlias) {
    return "run `npm run claude:fast`";
  }

  if (!alias) {
    return "run `npm run profile` to choose a preset";
  }

  if (alias === "qwen") {
    return `run \`${getProfileNextCommand(alias)}\``;
  }

  return `run \`${getProfileNextCommand(alias)}\``;
}

function handleVersion() {
  try {
    const pkgPath = path.join(scriptDirectory, "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    console.log(`Claudia Router v${pkg.version}`);
  } catch {
    console.log("Claudia Router (version unknown)");
  }
}

function handleChild(command, script) {
  const scriptPath = path.join(scriptDirectory, script);
  const childArgs = process.argv.slice(3);

  const child = spawnSync("node", [scriptPath, ...childArgs], {
    stdio: "inherit",
    env: process.env
  });

  process.exit(child.status ?? 0);
}

main();
