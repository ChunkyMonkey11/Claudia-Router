#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { runSetup } from "./setup.mjs";

const PROFILE_ALIASES = {
  fast: "claude-3-5-sonnet-latest",
  glm: "claude-3-5-sonnet-glm",
  qwen: "claude-3-5-sonnet-qwen",
  smoke: "claude-3-haiku-latest"
};

const REVERSE_PROFILE_ALIASES = Object.fromEntries(
  Object.entries(PROFILE_ALIASES).map(([alias, model]) => [model, alias])
);

const PROFILE_ORDER = ["fast", "glm", "qwen", "smoke"];

const USAGE = `Usage: claudia-router profile [name|show|list|toggle]

Commands:
  fast     Set the active Claude profile to fast
  glm      Set the active Claude profile to GLM quality
  qwen     Set the active Claude profile to Qwen fallback
  smoke    Set the active Claude profile to the smoke-test model
  list     Show all available profile presets
  toggle   Switch between fast and glm
  show     Print the current active profile

Options:
  -h, --help  Show this help message

With no arguments, \`profile\` opens the interactive preset chooser in a terminal.
`;

export async function runProfile(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const profileName = options.profileName;
  const envPath = path.join(cwd, ".env");

  if (!profileName) {
    if (options.question) {
      return await runInteractiveProfileChooser({ ...options, cwd, env, envPath });
    }

    return {
      exitCode: 0,
      output: `${renderCurrentProfile(envPath, env)}\n`
    };
  }

  if (profileName === "show") {
    return {
      exitCode: 0,
      output: `${renderCurrentProfile(envPath, env)}\n`
    };
  }

  if (profileName === "choose") {
    return await runInteractiveProfileChooser({ ...options, cwd, env, envPath });
  }

  if (profileName === "list") {
    return {
      exitCode: 0,
      output: `${renderProfileList(envPath, env)}\n`
    };
  }

  if (profileName === "toggle") {
    const current = getCurrentProfile(envPath, env);
    const nextProfile = current === "glm" ? "fast" : "glm";
    return applyProfile(cwd, envPath, nextProfile);
  }

  const model = PROFILE_ALIASES[profileName];
  if (!model) {
    return {
      exitCode: 1,
      output: `FAIL Unsupported profile: ${profileName}\n${USAGE}`
    };
  }

  return applyProfile(cwd, envPath, profileName, model);
}

function renderCurrentProfile(envPath, env) {
  const current = getCurrentProfile(envPath, env);
  const alias = REVERSE_PROFILE_ALIASES[current];

  if (!current) {
    return [
      "Active profile: not set",
      "Use `npm run profile` to choose a preset."
    ].join("\n");
  }

  if (alias) {
    return [
      `Active profile: ${alias}`,
      `Model alias: ${current}`,
      `Use \`npm run profile -- show\` to check it again.`
    ].join("\n");
  }

  return [
    "Active profile: custom",
    `Model alias: ${current}`,
    "Use `npm run profile -- show` to check it again."
  ].join("\n");
}

function renderProfileList(envPath, env) {
  const current = getCurrentProfile(envPath, env);
  const lines = ["Available profiles:", ""];

  for (const alias of PROFILE_ORDER) {
    const marker = PROFILE_ALIASES[alias] === current ? "*" : " ";
    lines.push(`${marker} ${alias} -> ${PROFILE_ALIASES[alias]}`);
  }

  lines.push("");
  lines.push("Use `npm run profile` to open the chooser, or `npm run profile -- fast` / `glm` to switch quickly.");
  lines.push("Use `npm run profile -- toggle` to flip between fast and glm.");

  return lines.join("\n");
}

async function runInteractiveProfileChooser(options) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const envPath = options.envPath ?? path.join(cwd, ".env");
  const question = options.question ?? defaultQuestion;
  const config = readConfig(cwd);
  const choices = buildProfileChoices(config);

  const response = (await question(renderChooserPrompt(choices))).trim().toLowerCase();
  const selection = resolveChooserSelection(response, choices);

  if (!selection) {
    return {
      exitCode: 1,
      output: `FAIL Unsupported preset: ${response || "(empty)"}\n${renderChooserHelp(choices)}`
    };
  }

  if (selection.kind === "profile") {
    return applyProfile(cwd, envPath, selection.profileName);
  }

  return await runSetup({
    cwd,
    env,
    providerKey: selection.providerKey,
    skipConfirmation: true,
    skipSmoke: true,
    commandExists: options.commandExists,
    nodeVersion: options.nodeVersion,
    fetchImpl: options.fetchImpl,
    question: options.question,
    promptForSecret: options.promptForSecret,
    apiKeyEnvName: options.apiKeyEnvName
  });
}

function applyProfile(cwd, envPath, profileName, explicitModel) {
  const model = explicitModel ?? PROFILE_ALIASES[profileName];
  const envFile = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const updated = upsertEnvVar(envFile, "CLAUDIA_CLAUDE_MODEL", model);
  fs.writeFileSync(envPath, updated, { encoding: "utf8" });

  return {
    exitCode: 0,
    output: [
      `OK   Active profile set to ${profileName} (${model})`,
      `     Updated ${path.relative(cwd, envPath) || ".env"}`,
      `     Next: ${getNextStep(profileName, model)}`
    ].join("\n") + "\n"
  };
}

function buildProfileChoices(config) {
  const hasNvidiaProfiles = Boolean(config?.modelProfiles?.["claude-3-5-sonnet-glm"]);

  const choices = [
    {
      key: "fast",
      kind: "profile",
      profileName: "fast",
      label: "fast",
      description: "Default coding preset"
    },
    {
      key: "smoke",
      kind: "profile",
      profileName: "smoke",
      label: "smoke",
      description: "Smallest smoke-test preset"
    },
    {
      key: "local",
      kind: "provider",
      providerKey: "local",
      label: "local",
      description: "Switch to the local provider"
    },
    {
      key: "nvidia",
      kind: "provider",
      providerKey: "nvidia",
      label: "nvidia",
      description: "Reconfigure for NVIDIA"
    },
    {
      key: "openrouter",
      kind: "provider",
      providerKey: "openrouter",
      label: "openrouter",
      description: "Reconfigure for OpenRouter"
    }
  ];

  if (hasNvidiaProfiles) {
    choices.splice(1, 0,
      {
        key: "glm",
        kind: "profile",
        profileName: "glm",
        label: "glm",
        description: "Higher-quality GLM preset"
      },
      {
        key: "qwen",
        kind: "profile",
        profileName: "qwen",
        label: "qwen",
        description: "Qwen fallback preset"
      }
    );
  }

  return choices;
}

function renderChooserPrompt(choices) {
  const lines = ["Choose a preset:", ""];

  choices.forEach((choice, index) => {
    lines.push(`  ${index + 1}. ${choice.label} - ${choice.description}`);
  });

  lines.push("");
  lines.push("Press Enter for fast, or type a number/name:");
  return lines.join("\n");
}

function renderChooserHelp(choices) {
  return [
    "",
    "Available presets:",
    ...choices.map((choice) => `  ${choice.label} - ${choice.description}`)
  ].join("\n");
}

function resolveChooserSelection(input, choices) {
  if (!input) {
    return choices.find((choice) => choice.label === "fast") ?? null;
  }

  const byName = choices.find((choice) => choice.label === input);
  if (byName) return byName;

  const numeric = Number.parseInt(input, 10);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= choices.length) {
    return choices[numeric - 1];
  }

  return null;
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

function getCurrentProfile(envPath, env) {
  const fileEnv = fs.existsSync(envPath) ? parseEnvFile(fs.readFileSync(envPath, "utf8")) : {};
  return (env.CLAUDIA_CLAUDE_MODEL ?? fileEnv.CLAUDIA_CLAUDE_MODEL ?? "").trim();
}

function getNextStep(profileName, model) {
  if (profileName === "fast" || profileName === "glm" || profileName === "smoke") {
    return `run \`npm run claude:${profileName}\``;
  }

  if (profileName === "qwen") {
    return "run `npm run claude:qwen`";
  }

  return `run \`claudia-claude --model ${model}\``;
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

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      return { help: true, options: null };
    }

    if (!arg.startsWith("-") && !options.profileName) {
      options.profileName = arg;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return { help: false, options };
}

function readConfig(cwd) {
  const configPath = path.join(cwd, "config.json");
  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return null;
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { help, options } = parseArgs(process.argv.slice(2));
    if (help) {
      process.stdout.write(`${USAGE}\n`);
      process.exitCode = 0;
    } else {
      const result = await runProfile({ ...options, question: defaultQuestion });
      process.stdout.write(result.output);
      process.exitCode = result.exitCode;
    }
  } catch (error) {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  }
}
