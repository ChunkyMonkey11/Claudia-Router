import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "dotenv";
import { runSetup } from "../scripts/setup.mjs";

function createSetupDirectory(env = "NVIDIA_API_KEY=your_nvidia_key_here\n"): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-router-setup-"));
  fs.writeFileSync(path.join(directory, ".env.example"), env, "utf8");
  fs.writeFileSync(path.join(directory, "config.example.json"), "{}", "utf8");
  return directory;
}

function successfulSmokeResponse(): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            role: "assistant",
            content: "ok"
          }
        }
      ]
    }),
    {
      status: 200
    }
  );
}

test("creates setup files, prompts for a missing key, and runs the NVIDIA smoke request", async () => {
  const cwd = createSetupDirectory();
  let requestBody: Record<string, unknown> | undefined;
  let authorization: string | null | undefined;

  const result = await runSetup({
    cwd,
    nodeVersion: "22.0.0",
    commandExists: () => true,
    promptForSecret: async () => "secret-test-key",
    fetchImpl: async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      authorization = new Headers(init?.headers).get("authorization");
      return successfulSmokeResponse();
    }
  });

  assert.equal(result.exitCode, 0);
  assert.equal(parse(fs.readFileSync(path.join(cwd, ".env"), "utf8")).NVIDIA_API_KEY, "secret-test-key");
  assert.equal(fs.existsSync(path.join(cwd, "config.json")), true);
  assert.equal(authorization, "Bearer secret-test-key");
  assert.equal(requestBody?.model, "nvidia/nemotron-mini-4b-instruct");
  assert.equal(requestBody?.stream, false);
  assert.doesNotMatch(result.output, /secret-test-key/);
  assert.match(result.output, /OK   NVIDIA smoke request completed/);
  assert.match(result.output, /Setup complete\. Start the router:\nnpm run dev/);
});

test("reuses an existing key without prompting", async () => {
  const cwd = createSetupDirectory("NVIDIA_API_KEY=existing-key\n");
  fs.copyFileSync(path.join(cwd, ".env.example"), path.join(cwd, ".env"));
  fs.copyFileSync(path.join(cwd, "config.example.json"), path.join(cwd, "config.json"));

  const result = await runSetup({
    cwd,
    nodeVersion: "22.0.0",
    commandExists: () => true,
    promptForSecret: async () => {
      throw new Error("prompt should not run");
    },
    fetchImpl: async () => successfulSmokeResponse()
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /OK   NVIDIA_API_KEY already configured/);
});

test("fails before setup when Claude Code is unavailable", async () => {
  const result = await runSetup({
    cwd: createSetupDirectory(),
    nodeVersion: "22.0.0",
    commandExists: () => false,
    fetchImpl: async () => {
      throw new Error("network request should not run");
    }
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /FAIL Claude Code CLI was not found/);
});

test("reports NVIDIA smoke request failures without exposing the key", async () => {
  const cwd = createSetupDirectory("NVIDIA_API_KEY=secret-test-key\n");
  fs.copyFileSync(path.join(cwd, ".env.example"), path.join(cwd, ".env"));

  const result = await runSetup({
    cwd,
    nodeVersion: "22.0.0",
    commandExists: () => true,
    fetchImpl: async () => new Response("unauthorized", { status: 401 })
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /FAIL NVIDIA smoke request failed: HTTP 401: unauthorized/);
  assert.doesNotMatch(result.output, /secret-test-key/);
});
