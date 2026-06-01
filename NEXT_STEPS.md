# Claudia Router Next Steps

Date: 2026-05-31
Scope: what to do after the current release-readiness pass, with NVIDIA as the primary user path.

## North Star

Make Claudia Router the easiest way to get Claude Code running through NVIDIA models with minimal setup, minimal decisions, and clear recovery when something breaks.

The default experience should be:

```sh
git clone ...
cd Claudia-Router
npm install
npm run quickstart
npm run dev
npm run claude:fast
```

Everything else should support that path, not distract from it.

## Product Direction

1. NVIDIA is the main audience.
2. Local models stay supported, but they are not the headline path.
3. OpenRouter stays available for power users, but it should remain secondary.
4. The first-run experience should feel like one obvious path, not a menu of choices.
5. Recovery should be as simple as possible:
   - setup failed: run `npm run doctor`
   - key changed: run `npm run key`
   - current state unclear: run `npm run status`

## Current State

What already works:

- `npm run quickstart` is the main onboarding path.
- `npm run init` still exists for provider-specific setup.
- `npm run doctor` checks prerequisites and the configured provider key.
- `npm run key` updates the provider API key in `.env`.
- `npm run status` shows the active profile and next action.
- `npm run profile` switches Claude presets.
- `npm run release:check` validates tests, build, and packaged-install smoke.

What still needs discipline:

- The docs still contain advanced paths that can distract from NVIDIA-first onboarding.
- Some commands are useful for advanced users but should not be front-and-center.
- Error messages should keep pushing users toward the next obvious action instead of requiring them to know the whole command surface.

## Priority Order

### 1. Tighten the NVIDIA-first onboarding story

Goal:
- A new user should understand the NVIDIA path in under 30 seconds.
- The docs should not make them choose between local, OpenRouter, and NVIDIA before they have even started.

What to do:
- Keep the top of README and QUICKSTART centered on NVIDIA.
- Keep local/OpenRouter in advanced sections only.
- Make sure the command examples at the top all point to the same path.
- Remove extra branching language from the first screen a user reads.

Acceptance criteria:
- The top of README and QUICKSTART both lead with the NVIDIA flow.
- Local/OpenRouter are clearly marked as advanced.
- A new user can copy the first command block without understanding the rest of the system.

### 2. Make key rotation obvious and low-friction

Goal:
- If a provider key changes, the user should not need to rerun the whole setup wizard.

What to do:
- Keep `npm run key` as the dedicated key-update flow.
- Make failure guidance mention `npm run key` when the active provider auth is broken.
- Keep `npm run doctor` focused on diagnosis, not replacement of secrets.
- Avoid making the user guess which env variable to edit manually.

Acceptance criteria:
- A user can replace their NVIDIA key with one command.
- The tool tells them exactly what to run when auth fails.
- `doctor` remains a diagnostic command, not a setup wizard.

### 3. Make status the fast recovery command

Goal:
- `npm run status` should answer two questions:
  - is the router up?
  - what should I run next?

What to do:
- Keep the existing backend/profile summary.
- Make the next-action line even more specific when possible.
- Prefer direct guidance such as:
  - `run npm run dev`
  - `run npm run claude:fast`
  - `run npm run doctor`
  - `run npm run key`
- Keep the output short enough that it feels like a status check, not a report.

Acceptance criteria:
- A user can run `npm run status` and immediately know what to do next.
- If the router is down, the command tells them to start it.
- If auth is broken, the command points to key rotation or `doctor`.

### 4. Keep profile switching available, but not dominant

Goal:
- Presets are useful, but they should not become onboarding clutter.

What to do:
- Keep `npm run profile` for day-two use.
- Keep `fast` as the default mental model.
- Keep `glm`, `qwen`, and `smoke` as advanced presets for NVIDIA users.
- Do not bring local/OpenRouter back into the main onboarding narrative just because the commands exist.

Acceptance criteria:
- Users who need presets can find them.
- First-time users are not forced to care about them.

### 5. Leave local/OpenRouter as advanced paths

Goal:
- Support them without centering them.

What to do:
- Keep setup paths documented, but below the NVIDIA-first path.
- Do not add more local-specific onboarding content unless it fixes a real setup gap.
- Do not expand provider support unless it improves adoption or reliability.

Acceptance criteria:
- Local and OpenRouter remain usable.
- They no longer dominate the quick-start narrative.

## Recommended Next Work Queue

If resuming after a break, do these in order:

1. Audit README and QUICKSTART for any remaining places where local/OpenRouter are given equal prominence to NVIDIA.
2. Improve `status` so it suggests `npm run key` when the configured provider key is broken or missing.
3. Improve `doctor` messaging so auth failure guidance is direct and provider-specific.
4. Trim or relocate advanced setup sections that are still too visible in the first-run flow.
5. Do one fresh NVIDIA-only user walkthrough from a clean clone and keep the notes short.

## Longer-Term Product Work

These are not the next immediate tasks, but they are the likely follow-ons once the NVIDIA-first onboarding is as simple as it can reasonably be:

- Broader Claude Code compatibility testing
- Token-by-token streaming passthrough
- Request replay logs
- Cost estimation
- Provider fallback
- Simple web dashboard
- Policy layer for blocking risky actions
- Prompt redaction
- Stronger Claude Code-specific compatibility tests

## What Not To Do Next

- Do not add more setup branches to the first screen a new user sees.
- Do not make local models look like the primary story in the docs.
- Do not expand provider support unless it directly improves onboarding or reliability.
- Do not trade simplicity for a large feature addition that only helps advanced users.

## Handoff Summary

If you come back later, the work should start with the NVIDIA-first path and key recovery:

- `npm run quickstart`
- `npm run doctor`
- `npm run key`
- `npm run status`

Those are the commands that matter most for making Claudia Router easy to adopt and easy to recover.
