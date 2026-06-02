#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    stdio: "pipe"
  });

  if (result.status !== 0) {
    const stdout = result.stdout?.trim() ?? "";
    const stderr = result.stderr?.trim() ?? "";
    throw new Error(
      `Command failed: ${command} ${args.join(" ")}\n` +
      `${stdout ? `stdout:\n${stdout}\n` : ""}` +
      `${stderr ? `stderr:\n${stderr}\n` : ""}`
    );
  }

  return result.stdout ?? "";
}

function makeFakeClaudeBin(rootDir) {
  const binDir = path.join(rootDir, "fake-bin");
  fs.mkdirSync(binDir, { recursive: true });
  const claudePath = path.join(binDir, "claude");
  fs.writeFileSync(
    claudePath,
    "#!/usr/bin/env sh\necho 'claude 0.0.0-test'\n",
    { encoding: "utf8", mode: 0o755 }
  );
  return binDir;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const repoRoot = process.cwd();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-router-release-smoke-"));
  const fakeBin = makeFakeClaudeBin(tmpRoot);

  const packageJson = readJson(path.join(repoRoot, "package.json"));
  const expectedVersion = packageJson.version;

  process.stdout.write("1) Packing npm artifact...\n");
  const packOutput = run("npm", ["pack", "--json"], { cwd: repoRoot });
  const packEntries = JSON.parse(packOutput);
  const tarballName = packEntries?.[0]?.filename;
  if (!tarballName) {
    throw new Error("npm pack did not return a tarball filename");
  }

  const tarballPath = path.join(repoRoot, tarballName);
  const installDir = path.join(tmpRoot, "install-test");
  fs.mkdirSync(installDir, { recursive: true });

  const env = {
    ...process.env,
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`
  };

  try {
    process.stdout.write("2) Installing tarball into a clean directory...\n");
    run("npm", ["init", "-y"], { cwd: installDir, env });
    run("npm", ["install", tarballPath], { cwd: installDir, env });

    process.stdout.write("3) Verifying CLI version...\n");
    const versionOut = run("npx", ["claudia-router", "version"], { cwd: installDir, env });
    if (!versionOut.includes(`Claudia Router v${expectedVersion}`)) {
      throw new Error(`Unexpected version output: ${versionOut.trim()}`);
    }

    process.stdout.write("4) Running first-run setup (local provider)...\n");
    const initOut = run("npx", ["claudia-router", "init", "--provider", "local", "--yes"], {
      cwd: installDir,
      env
    });
    assert(initOut.includes("Setup complete. Start the router:"), "init did not report successful completion");

    const envPath = path.join(installDir, ".env");
    const configPath = path.join(installDir, "config.json");
    assert(fs.existsSync(envPath) && fs.existsSync(configPath), "init did not create .env and config.json");

    const generatedConfig = readJson(configPath);
    assert(generatedConfig.defaultBackend === "local", `Expected defaultBackend=local, got ${generatedConfig.defaultBackend}`);

    process.stdout.write("5) Running doctor after setup...\n");
    const doctorOut = run("npx", ["claudia-router", "doctor"], { cwd: installDir, env });
    assert(doctorOut.includes("OK   LOCAL_API_KEY is configured"), "doctor did not validate local provider key");

    process.stdout.write("6) Running OpenRouter setup via env override (skip smoke)...\n");
    const initOpenRouterOut = run(
      "npx",
      ["claudia-router", "init", "--provider", "openrouter", "--yes", "--skip-smoke", "--api-key-env", "TEST_OPENROUTER_KEY"],
      {
        cwd: installDir,
        env: {
          ...env,
          TEST_OPENROUTER_KEY: "openrouter-test-key"
        }
      }
    );
    assert(initOpenRouterOut.includes("OK   API key loaded from TEST_OPENROUTER_KEY"), "openrouter init did not use api-key-env");
    assert(!initOpenRouterOut.includes("Testing connectivity..."), "openrouter init unexpectedly ran smoke test");
    assert(initOpenRouterOut.includes("Setup complete. Start the router:"), "openrouter init did not complete successfully");

    const openRouterConfig = readJson(configPath);
    assert(openRouterConfig.defaultBackend === "openrouter", `Expected defaultBackend=openrouter, got ${openRouterConfig.defaultBackend}`);
    const envFile = fs.readFileSync(envPath, "utf8");
    assert(envFile.includes("OPENROUTER_API_KEY=openrouter-test-key"), ".env did not persist OPENROUTER_API_KEY");

    process.stdout.write("7) Running doctor after OpenRouter setup...\n");
    const openRouterDoctorOut = run("npx", ["claudia-router", "doctor"], { cwd: installDir, env });
    assert(openRouterDoctorOut.includes("OK   OPENROUTER_API_KEY is configured"), "doctor did not validate openrouter provider key");

    process.stdout.write("8) Running default NVIDIA setup path via env override (skip smoke)...\n");
    const initNvidiaOut = run(
      "npx",
      ["claudia-router", "init", "--yes", "--skip-smoke", "--api-key-env", "TEST_NVIDIA_KEY"],
      {
        cwd: installDir,
        env: {
          ...env,
          TEST_NVIDIA_KEY: "nvidia-test-key"
        }
      }
    );
    assert(initNvidiaOut.includes("OK   API key loaded from TEST_NVIDIA_KEY"), "nvidia init did not use api-key-env");
    assert(!initNvidiaOut.includes("Testing connectivity..."), "nvidia init unexpectedly ran smoke test");
    assert(initNvidiaOut.includes("Setup complete. Start the router:"), "nvidia init did not complete successfully");

    const nvidiaConfig = readJson(configPath);
    assert(nvidiaConfig.defaultBackend === "nvidia", `Expected defaultBackend=nvidia, got ${nvidiaConfig.defaultBackend}`);
    assert(
      nvidiaConfig.backends?.nvidia?.defaultModel === "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16",
      `Expected NVIDIA defaultModel to use the Nemotron Super model, got ${nvidiaConfig.backends?.nvidia?.defaultModel}`
    );
    assert(
      nvidiaConfig.modelProfiles?.["claude-3-5-sonnet-latest"]?.providerModel ===
        "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16",
      "Expected fast profile to use the Nemotron Super model"
    );
    assert(
      nvidiaConfig.modelProfiles?.["claude-3-5-sonnet-qwen"]?.providerModel ===
        "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16",
      "Expected qwen fallback profile to use the Nemotron Nano model"
    );
    const nvidiaEnvFile = fs.readFileSync(envPath, "utf8");
    assert(nvidiaEnvFile.includes("NVIDIA_API_KEY=nvidia-test-key"), ".env did not persist NVIDIA_API_KEY");

    process.stdout.write("9) Running doctor after NVIDIA setup...\n");
    const nvidiaDoctorOut = run("npx", ["claudia-router", "doctor"], { cwd: installDir, env });
    assert(nvidiaDoctorOut.includes("OK   NVIDIA_API_KEY is configured"), "doctor did not validate nvidia provider key");

    process.stdout.write("Release smoke test passed.\n");
  } finally {
    if (fs.existsSync(tarballPath)) {
      fs.unlinkSync(tarballPath);
    }
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`FAIL ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
}
