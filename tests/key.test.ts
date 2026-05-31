import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runKey } from "../scripts/key.mjs";

function createKeyDirectory(env = ""): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-router-key-"));
  if (env) {
    fs.writeFileSync(path.join(directory, ".env"), env, "utf8");
  }
  fs.writeFileSync(
    path.join(directory, "config.json"),
    JSON.stringify(
      {
        defaultBackend: "nvidia",
        backends: {
          nvidia: {
            apiKeyEnv: "NVIDIA_API_KEY"
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );
  return directory;
}

test("key command updates the NVIDIA API key in .env", async () => {
  const cwd = createKeyDirectory("NVIDIA_API_KEY=old-key\n");
  const result = await runKey({
    cwd,
    skipConfirmation: true,
    promptForSecret: async () => "new-key"
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /OK   NVIDIA_API_KEY updated/);
  assert.match(fs.readFileSync(path.join(cwd, ".env"), "utf8"), /NVIDIA_API_KEY=new-key/);
});

test("key command can load a new key from an environment variable", async () => {
  const cwd = createKeyDirectory("OPENROUTER_API_KEY=old-key\n");
  const result = await runKey({
    cwd,
    providerKey: "openrouter",
    apiKeyEnvName: "TEST_OPENROUTER_KEY",
    skipConfirmation: true,
    env: {
      TEST_OPENROUTER_KEY: "openrouter-new-key"
    }
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /OK   OPENROUTER_API_KEY updated/);
  assert.match(result.output, /Loaded from TEST_OPENROUTER_KEY/);
  assert.match(fs.readFileSync(path.join(cwd, ".env"), "utf8"), /OPENROUTER_API_KEY=openrouter-new-key/);
});

test("key command rejects providers that do not require a key", async () => {
  const cwd = createKeyDirectory();
  const result = await runKey({
    cwd,
    providerKey: "local"
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /does not require an API key/);
});
