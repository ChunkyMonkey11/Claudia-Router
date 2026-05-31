#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

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
  // Try to read the config to determine the port
  let port = 8082;
  try {
    const cwd = process.cwd();
    const configPath = path.resolve(cwd, "config.json");
    if (fs.existsSync(configPath)) {
      const configJson = JSON.parse(fs.readFileSync(configPath, "utf8"));
      port = configJson.port ?? 8082;
    }
  } catch {
    // Use default port
  }

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
      process.exit(0);
      return;
    }
  } catch {
    // Health check failed, but port is listening - still report as running
  }

  console.log(`✓ Router is running on port ${port} (port is listening)`);
  process.exit(0);
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
