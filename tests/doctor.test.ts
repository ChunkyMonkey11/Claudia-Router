import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runDoctor } from "../scripts/doctor.mjs";

function createDoctorDirectory(env: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-router-doctor-"));
  fs.writeFileSync(path.join(directory, ".env"), env, "utf8");
  fs.writeFileSync(path.join(directory, "config.json"), "{}", "utf8");
  return directory;
}

test("fails when NVIDIA_API_KEY is missing", () => {
  const result = runDoctor({
    cwd: createDoctorDirectory("LOG_LEVEL=info\n"),
    nodeVersion: "22.0.0",
    commandExists: () => true
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /FAIL NVIDIA_API_KEY is missing or still a placeholder/);
  assert.match(result.output, /Add `NVIDIA_API_KEY=your_key` to \.env/);
});

test("passes when prerequisites and NVIDIA_API_KEY are configured", () => {
  const result = runDoctor({
    cwd: createDoctorDirectory("NVIDIA_API_KEY=test-key\n"),
    nodeVersion: "22.0.0",
    commandExists: () => true
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /OK   Node\.js v22\.0\.0/);
  assert.match(result.output, /OK   Claude Code CLI found/);
  assert.match(result.output, /OK   \.env found/);
  assert.match(result.output, /OK   config\.json found/);
  assert.match(result.output, /OK   NVIDIA_API_KEY is configured/);
});
