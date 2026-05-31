#!/usr/bin/env node
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { runSetup } from "./setup.mjs";
import { runDoctor } from "./doctor.mjs";
import { runProfile } from "./profile.mjs";

const USAGE = `Usage: claudia-router quickstart [options]

Options:
  --provider <nvidia|openrouter|local>  Setup provider (default: nvidia)
  --api-key-env <ENV_NAME>              Read API key from an existing environment variable
  --profile <fast|glm|qwen|smoke|toggle> Set the active Claude profile after setup
  --yes                                 Skip confirmation prompts
  --skip-smoke                          Skip provider smoke test during setup
  --start                               Start the router after setup/doctor pass
  -h, --help                            Show this help message
`;

export async function runQuickstart(options = {}) {
  const setupResult = await runSetup(options);
  const lines = [setupResult.output.trimEnd(), "", "Running doctor checks..."];

  if (setupResult.exitCode !== 0) {
    lines.push("Quickstart stopped because setup failed.");
    return {
      exitCode: setupResult.exitCode,
      output: `${lines.join("\n")}\n`
    };
  }

  const doctorResult = runDoctor({
    cwd: options.cwd,
    nodeVersion: options.nodeVersion,
    commandExists: options.commandExists
  });

  lines.push(doctorResult.output.trimEnd());

  if (doctorResult.exitCode !== 0) {
    lines.push("Quickstart failed doctor checks. Fix the failures above and re-run `npm run quickstart`.");
    return {
      exitCode: doctorResult.exitCode,
      output: `${lines.join("\n")}\n`
    };
  }

  if (options.profileName) {
    lines.push("");
    lines.push("Applying profile...");
    const profileResult = await runProfile({
      cwd: options.cwd,
      env: options.env,
      profileName: options.profileName
    });
    lines.push(profileResult.output.trimEnd());

    if (profileResult.exitCode !== 0) {
      lines.push("Quickstart stopped because profile selection failed.");
      return {
        exitCode: profileResult.exitCode,
        output: `${lines.join("\n")}\n`
      };
    }
  }

  if (options.startAfterSetup) {
    lines.push("Starting router (npm run dev)...");
    process.stdout.write(`${lines.join("\n")}\n`);
    const child = spawn("npm", ["run", "dev"], {
      cwd: options.cwd,
      stdio: "inherit",
      env: options.env ?? process.env,
      shell: process.platform === "win32"
    });

    await new Promise((resolve) => {
      child.on("exit", (code) => {
        process.exitCode = code ?? 0;
        resolve();
      });
    });

    return {
      exitCode: process.exitCode ?? 0,
      output: ""
    };
  }

  lines.push("Quickstart complete.");
  lines.push("Next: run `npm run dev` and then `npm run claude:fast`.");

  return {
    exitCode: 0,
    output: `${lines.join("\n")}\n`
  };
}

function parseArgs(argv) {
  const options = {
    providerKey: "nvidia",
    profileName: null,
    skipConfirmation: false,
    skipSmoke: false,
    startAfterSetup: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

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

    if (arg === "--start") {
      options.startAfterSetup = true;
      continue;
    }

    if (arg === "--profile") {
      const value = argv[i + 1];
      if (!value) throw new Error("Missing value for --profile");
      options.profileName = value;
      i += 1;
      continue;
    }

    if (arg.startsWith("--profile=")) {
      options.profileName = arg.slice("--profile=".length);
      continue;
    }

    if (arg === "--provider") {
      const value = argv[i + 1];
      if (!value) throw new Error("Missing value for --provider");
      options.providerKey = value;
      i += 1;
      continue;
    }

    if (arg.startsWith("--provider=")) {
      options.providerKey = arg.slice("--provider=".length);
      continue;
    }

    if (arg === "--api-key-env") {
      const value = argv[i + 1];
      if (!value) throw new Error("Missing value for --api-key-env");
      options.apiKeyEnvName = value;
      i += 1;
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

  if (options.profileName && !["fast", "glm", "qwen", "smoke", "toggle"].includes(options.profileName)) {
    throw new Error(`Unsupported profile: ${options.profileName}`);
  }

  return { help: false, options };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { help, options } = parseArgs(process.argv.slice(2));
    if (help) {
      process.stdout.write(`${USAGE}\n`);
      process.exitCode = 0;
    } else {
      const result = await runQuickstart(options);
      if (result.output) process.stdout.write(result.output);
      process.exitCode = result.exitCode;
    }
  } catch (error) {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  }
}
