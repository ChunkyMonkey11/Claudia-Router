import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repositoryRoot, "scripts", "claudia-router.mjs");

function createStatusDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-router-status-"));
  fs.writeFileSync(
    path.join(directory, "config.json"),
    JSON.stringify(
      {
        port: 3099,
        defaultBackend: "nvidia",
        backends: {
          nvidia: {
            baseUrl: "https://example.invalid/v1",
            apiKeyEnv: "NVIDIA_API_KEY",
            defaultModel: "stepfun-ai/step-3.5-flash"
          }
        },
        modelMap: {},
        modelProfiles: {
          "claude-3-5-sonnet-glm": {
            backend: "nvidia",
            providerModel: "z-ai/glm4.7"
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(path.join(directory, ".env"), "NVIDIA_API_KEY=test-key\nCLAUDIA_CLAUDE_MODEL=claude-3-5-sonnet-glm\n", "utf8");
  return directory;
}

function createFakeLsofDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-router-lsof-"));
  const executable = path.join(directory, "lsof");
  fs.writeFileSync(
    executable,
    "#!/bin/sh\nexit 0\n",
    {
      encoding: "utf8",
      mode: 0o755
    }
  );
  return directory;
}

test("router status prints the active profile and routing summary", async () => {
  const cwd = createStatusDirectory();
  const fakeLsof = createFakeLsofDirectory();

  const server = http.createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, name: "claudia-router", version: "0.1.0", uptime_seconds: 1.5 }));
      return;
    }

    response.writeHead(404);
    response.end();
  });

  await new Promise<void>((resolve) => {
    server.listen(3099, resolve);
  });

  try {
    const result = spawnSync(process.execPath, [cliPath, "status"], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fakeLsof}${path.delimiter}${process.env.PATH ?? ""}`
      }
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Active profile: glm \(claude-3-5-sonnet-glm\)/);
    assert.match(result.stdout, /Backend: nvidia/);
    assert.match(result.stdout, /Provider model: z-ai\/glm4\.7/);
    assert.match(result.stdout, /Router port: 3099/);
    assert.match(result.stdout, /✓ Router is running on port 3099/);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
});
