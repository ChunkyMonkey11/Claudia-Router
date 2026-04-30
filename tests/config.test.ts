import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.js";

function writeTempConfig(config: unknown): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-router-config-"));
  const configPath = path.join(directory, "config.json");
  fs.writeFileSync(configPath, JSON.stringify(config), "utf8");
  return configPath;
}

test("loads legacy modelMap configs without modelProfiles", () => {
  const configPath = writeTempConfig({
    port: 8082,
    defaultBackend: "local",
    backends: {
      local: {
        baseUrl: "http://localhost:1234/v1/",
        apiKeyEnv: "LOCAL_API_KEY",
        defaultModel: "local-default"
      }
    },
    modelMap: {
      "claude-3-5-sonnet-latest": {
        backend: "local",
        model: "legacy-model"
      }
    }
  });

  const config = loadConfig(configPath);

  assert.deepEqual(config.modelProfiles, {});
  assert.equal(config.modelMap["claude-3-5-sonnet-latest"]?.model, "legacy-model");
  assert.equal(config.backends.local?.baseUrl, "http://localhost:1234/v1");
});

test("loads model profiles and normalizes model as a providerModel alias", () => {
  const configPath = writeTempConfig({
    port: 8082,
    defaultBackend: "local",
    backends: {
      local: {
        baseUrl: "http://localhost:1234/v1",
        apiKeyEnv: "LOCAL_API_KEY",
        defaultModel: "local-default"
      }
    },
    modelProfiles: {
      "claude-opus-4-1": {
        backend: "local",
        model: "provider-profile-model",
        retryAttempts: 2,
        retryBaseDelayMs: 100,
        extraBody: {
          chat_template_kwargs: {
            enable_thinking: true,
            clear_thinking: false
          }
        },
        notes: "profile note",
        capabilities: {
          toolUse: true
        }
      }
    }
  });

  const config = loadConfig(configPath);
  const profile = config.modelProfiles["claude-opus-4-1"];

  assert.equal(profile?.providerModel, "provider-profile-model");
  assert.equal(profile?.retryAttempts, 2);
  assert.equal(profile?.retryBaseDelayMs, 100);
  assert.deepEqual(profile?.extraBody, {
    chat_template_kwargs: {
      enable_thinking: true,
      clear_thinking: false
    }
  });
  assert.equal(profile?.notes, "profile note");
  assert.deepEqual(profile?.capabilities, {
    toolUse: true
  });
});
