#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { runSetup } from "./setup.mjs";
import {
  buildInteractiveChoices,
  getAvailableProfileAliases,
  getProfileAlias,
  getProfileModel,
  getProfileNextCommand,
  renderChooserHelp,
  renderChooserPrompt
} from "./presets.mjs";

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
      output: `${renderProfileList(cwd, envPath, env)}\n`
    };
  }

  if (profileName === "toggle") {
    const current = getCurrentProfile(envPath, env);
    const nextProfile = current === getProfileModel("glm") ? "fast" : "glm";
    return applyProfile(cwd, envPath, nextProfile);
  }

  const model = getProfileModel(profileName);
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
  const alias = getProfileAlias(current);

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

function renderProfileList(cwd, envPath, env) {
  const current = getCurrentProfile(envPath, env);
  const lines = ["Available profiles:", ""];

  for (const alias of getAvailableProfileAliases(readConfig(cwd))) {
    const marker = getProfileModel(alias) === current ? "*" : " ";
    lines.push(`${marker} ${alias} -> ${getProfileModel(alias)}`);
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
  const choices = buildInteractiveChoices(config);

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
  const model = explicitModel ?? getProfileModel(profileName);
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
  const nextCommand = getProfileNextCommand(profileName);
  return nextCommand ? `run \`${nextCommand}\`` : `run \`claudia-claude --model ${model}\``;
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
