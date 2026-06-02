import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runConfigWizard } from "../scripts/claudia-config.mjs";

function createDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "claudia-router-config-wizard-"));
}

function questionAnswers(...answers: string[]) {
  return async () => answers.shift() ?? "";
}

test("configuration wizard aborts cleanly when existing files are not approved", async () => {
  const cwd = createDirectory();
  const logs: string[] = [];
  fs.writeFileSync(path.join(cwd, ".env"), "NVIDIA_API_KEY=existing\n", "utf8");
  fs.writeFileSync(path.join(cwd, "config.json"), "{}\n", "utf8");

  const exitCode = await runConfigWizard({
    cwd,
    log: (message: string) => logs.push(message),
    question: questionAnswers("n")
  });

  assert.equal(exitCode, 0);
  assert.match(logs.join("\n"), /Aborted\./);
  assert.doesNotMatch(logs.join("\n"), /\{ end:/);
  assert.equal(fs.readFileSync(path.join(cwd, ".env"), "utf8"), "NVIDIA_API_KEY=existing\n");
});

test("configuration wizard generates a local-provider config from line answers", async () => {
  const cwd = createDirectory();
  const logs: string[] = [];

  const exitCode = await runConfigWizard({
    cwd,
    log: (message: string) => logs.push(message),
    question: questionAnswers("3")
  });

  assert.equal(exitCode, 0);
  assert.match(fs.readFileSync(path.join(cwd, ".env"), "utf8"), /LOCAL_API_KEY=dummy/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(cwd, "config.json"), "utf8")).defaultBackend, "local");
  assert.match(logs.join("\n"), /Selected: Local/);
});

test("configuration wizard awaits remote connectivity before completion", async () => {
  const cwd = createDirectory();
  const logs: string[] = [];
  let smokeRequestFinished = false;

  const exitCode = await runConfigWizard({
    cwd,
    env: {
      NVIDIA_API_KEY: "test-key"
    },
    log: (message: string) => logs.push(message),
    question: questionAnswers(""),
    fetchImpl: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      smokeRequestFinished = true;
      return new Response("{}", { status: 200 });
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(smokeRequestFinished, true);
  assert.match(logs.join("\n"), /OK Connected to nvidia successfully/);
  assert.match(logs.join("\n"), /Configuration complete!/);
  const config = JSON.parse(fs.readFileSync(path.join(cwd, "config.json"), "utf8"));
  assert.equal(config.modelProfiles["claude-3-5-sonnet-latest"]?.providerModel, "z-ai/glm-5.1");
  assert.equal(config.modelProfiles["claude-3-5-sonnet-glm"]?.providerModel, "z-ai/glm4.7");
  assert.equal(config.modelProfiles["claude-3-5-sonnet-qwen"]?.providerModel, "qwen/qwen3.5-122b-a10b");
});
