# Release Readiness Audit

Date: 2026-05-31
Scope: Claudia Router early public-release readiness focused on first-run success.

## Summary

Status: Ready for early adopters.

- Proven today: `npm run release:check` passes (typecheck + tests + build + packaged-install smoke).
- Remaining before broad/public GA: optional external live-provider connectivity confirmation (real NVIDIA key) outside this dev workspace.

## Criteria Audit

1. New user can clone/install/run with minimal steps
- Status: Proven for early-adopter scope
- Evidence:
  - [README.md](./README.md) Quick Start has clone/install + explicit `npm run init` paths.
  - [QUICKSTART.md](./QUICKSTART.md) Fastest Paths has short command sequences.
  - `npm run release:smoke` installs from packed tarball in a clean temp directory and runs setup + doctor.
  - 2026-05-31 fresh-worktree walkthrough passed:
    - `npm install`
    - `npm run init -- --provider local --yes`
    - `npm run doctor`
    - `npm run dev` + `curl /health`

2. `npm run init` is the main setup path and is reliable
- Status: Proven
- Evidence:
  - `init` is the documented primary path in [README.md](./README.md) and [QUICKSTART.md](./QUICKSTART.md).
  - [scripts/setup.mjs](./scripts/setup.mjs) handles provider overrides, key env overrides, skip-smoke, and completion output.
  - Tests in [tests/setup.test.ts](./tests/setup.test.ts) cover missing key, provider override, skip-smoke, and completion behavior.
  - `release:smoke` now validates all setup entry paths from packaged install:
    - default NVIDIA (`init --api-key-env ... --skip-smoke`)
    - OpenRouter (`--provider openrouter --api-key-env ... --skip-smoke`)
    - Local (`--provider local`)

3. README and QUICKSTART match actual behavior
- Status: Proven for current setup paths
- Evidence:
  - Both docs now center on `npm run init`, include local/no-key and provider-switch paths, and surface `npm run doctor` recovery.
  - Release smoke validates documented install/setup behavior from package artifact.
- Residual risk:
  - Live remote-provider connectivity still depends on external account/key health; smoke checks intentionally use `--skip-smoke` for deterministic CI behavior.

4. Setup failures are clear and actionable
- Status: Proven
- Evidence:
  - [scripts/doctor.mjs](./scripts/doctor.mjs) gives direct remediation (`Run npm run init`) and provider-specific key checks.
  - [scripts/setup.mjs](./scripts/setup.mjs) reports missing env/key requirements with actionable messages.
  - Troubleshooting sections in [QUICKSTART.md](./QUICKSTART.md) and recovery callouts in both docs.

5. Clean distribution story: installable package, release artifacts, predictable flow
- Status: Proven for current scope
- Evidence:
  - Package scripts include `release:smoke` and canonical `release:check` in [package.json](./package.json).
  - [scripts/release-smoke.mjs](./scripts/release-smoke.mjs) verifies packed tarball install + local/openrouter setup + doctor.
  - [README.md](./README.md) Release Checklist points to `npm run release:check` as the release gate.

6. Testing coverage believable for release story
- Status: Proven for early-adopter release
- Evidence:
  - Full suite passing via `npm run check` (62 tests).
  - Release gate `npm run release:check` currently passes end-to-end.

7. Code and docs honest about current limitations
- Status: Proven
- Evidence:
  - [README.md](./README.md) explicitly lists non-goals/limitations (streaming passthrough, full compatibility, vision/multimodal).

## Verification Commands

Run these before a release tag:

```sh
npm run release:check
```

Manual runtime checks used in this audit:

```sh
npm install
npm run init -- --provider local --yes
npm run doctor
npm run dev
curl http://localhost:8082/health
```

## Remaining Work (Post-RC / Optional)

- Optional: execute one external fresh-machine live NVIDIA walkthrough (`npm run init` without `--skip-smoke`) and record outcomes.
- Keep this audit updated whenever setup scripts, docs, or release gates change.
