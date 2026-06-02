import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runProfile } from "../scripts/profile.mjs";

function createProfileDirectory(env = ""): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-router-profile-"));
  if (env) {
    fs.writeFileSync(path.join(directory, ".env"), env, "utf8");
  }
  return directory;
}

function writeNvidiaConfig(cwd: string): void {
  fs.writeFileSync(
    path.join(cwd, "config.json"),
    JSON.stringify(
      {
        defaultBackend: "nvidia",
        backends: {
          nvidia: {
            baseUrl: "https://integrate.api.nvidia.com/v1",
            apiKeyEnv: "NVIDIA_API_KEY",
            defaultModel: "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16"
          }
        },
        modelMap: {},
        modelProfiles: {
          "claude-3-5-sonnet-latest": {
            backend: "nvidia",
            providerModel: "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16"
          },
          "claude-3-5-sonnet-glm": {
            backend: "nvidia",
            providerModel: "z-ai/glm4.7"
          },
          "claude-3-5-sonnet-qwen": {
            backend: "nvidia",
            providerModel: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16"
          },
          "claude-3-haiku-latest": {
            backend: "nvidia",
            providerModel: "nvidia/nemotron-mini-4b-instruct"
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );
}

test("profile show reports unset state when CLAUDIA_CLAUDE_MODEL is missing", async () => {
  const result = await runProfile({
    cwd: createProfileDirectory()
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /Active profile: not set/);
});

test("profile command sets the active fast profile in .env", async () => {
  const cwd = createProfileDirectory("NVIDIA_API_KEY=test-key\n");
  const result = await runProfile({
    cwd,
    profileName: "fast"
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /Active profile set to fast/);
  assert.match(fs.readFileSync(path.join(cwd, ".env"), "utf8"), /CLAUDIA_CLAUDE_MODEL=claude-3-5-sonnet-latest/);
});

test("profile list shows the available presets", async () => {
  const cwd = createProfileDirectory("CLAUDIA_CLAUDE_MODEL=claude-3-5-sonnet-glm\n");
  writeNvidiaConfig(cwd);
  const result = await runProfile({
    cwd,
    profileName: "list"
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /Available profiles:/);
  assert.match(result.output, /\* glm -> claude-3-5-sonnet-glm/);
  assert.match(result.output, /toggle/i);
});

test("profile chooser opens on no arguments and can select glm", async () => {
  const cwd = createProfileDirectory("NVIDIA_API_KEY=test-key\n");
  writeNvidiaConfig(cwd);

  const result = await runProfile({
    cwd,
    commandExists: () => true,
    question: async () => "glm"
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /Active profile set to glm/);
  assert.match(fs.readFileSync(path.join(cwd, ".env"), "utf8"), /CLAUDIA_CLAUDE_MODEL=claude-3-5-sonnet-glm/);
});

test("profile chooser defaults to fast when the user presses Enter", async () => {
  const cwd = createProfileDirectory("NVIDIA_API_KEY=test-key\n");
  writeNvidiaConfig(cwd);

  const result = await runProfile({
    cwd,
    commandExists: () => true,
    question: async () => ""
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /Active profile set to fast/);
  assert.match(fs.readFileSync(path.join(cwd, ".env"), "utf8"), /CLAUDIA_CLAUDE_MODEL=claude-3-5-sonnet-latest/);
});

test("profile chooser can switch to local provider", async () => {
  const cwd = createProfileDirectory("NVIDIA_API_KEY=test-key\n");
  writeNvidiaConfig(cwd);

  const result = await runProfile({
    cwd,
    commandExists: () => true,
    question: async () => "local"
  });

  assert.equal(result.exitCode, 0);
  assert.match(JSON.parse(fs.readFileSync(path.join(cwd, "config.json"), "utf8")).defaultBackend, /local/);
  assert.match(fs.readFileSync(path.join(cwd, ".env"), "utf8"), /LOCAL_API_KEY=dummy/);
});

test("profile toggle flips between fast and glm", async () => {
  const cwd = createProfileDirectory("CLAUDIA_CLAUDE_MODEL=claude-3-5-sonnet-latest\n");
  const result = await runProfile({
    cwd,
    profileName: "toggle"
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /Active profile set to glm/);
  assert.match(fs.readFileSync(path.join(cwd, ".env"), "utf8"), /CLAUDIA_CLAUDE_MODEL=claude-3-5-sonnet-glm/);
});

test("profile command rejects unsupported profiles", async () => {
  const result = await runProfile({
    cwd: createProfileDirectory(),
    profileName: "banana"
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /Unsupported profile: banana/);
});
