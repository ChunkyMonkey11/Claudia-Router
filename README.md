# Claudia Router

Claudia Router is a local Anthropic-compatible proxy for Claude Code-style workflows.
It accepts Anthropic `/v1/messages` requests and routes them to OpenAI-compatible model providers.

Primary focus: NVIDIA-backed Claude usage with a simple first-run setup.

## Contents

- [Quick Start](#quick-start)
- [Install](#install)
- [Use](#use)
- [Configure](#configure)
- [Validate](#validate)
- [Publishing](#publishing)
- [Limitations](#limitations)
- [Roadmap](#roadmap)

## Quick Start

If you want the shortest path, use the NVIDIA-first flow:

```sh
git clone https://github.com/ChunkyMonkey11/Claudia-Router.git
cd Claudia-Router
npm install
npm run quickstart
npm run dev
npm run claude:fast
```

If setup fails:

```sh
npm run doctor
```

`npm run quickstart` is the main first-run path. Add `-- --start` to launch the router automatically after setup. Add `-- --profile glm` only if you want to choose a different preset during onboarding.

If your NVIDIA key changes later:

```sh
npm run key
```

If you need the current router state:

```sh
npm run status
```

If you want to switch presets without editing `.env`:

```sh
npm run profile
```

Press Enter to keep the fast preset.

## Install

### User install from npm

When published, the intended user path is:

```sh
npm install -g claudia-router
claudia-router init
claudia-router dev
claudia-claude
```

If you do not want a global install:

```sh
npx claudia-router init
npx claudia-router doctor
```

### Development install

If you are working on the repository itself, you can link the wrapper locally:

```sh
npm link
```

## Use

### Run Claude Code through the router

Keep the router running, then start Claude in another terminal:

```sh
npm run claude:fast
```

After a global install, you can use the wrapper from any coding project:

```sh
cd /path/to/your/project
claudia-claude
```

The wrapper runs `claude` with `ANTHROPIC_BASE_URL` pointed at the local router and the default router model already set.
By default it uses local auth so NVIDIA-only users can run it immediately.

Pass normal Claude Code arguments as usual:

```sh
claudia-claude --model claude-3-5-sonnet-glm
```

If you want Claude Code managed login instead, opt in explicitly:

```sh
claudia-claude --managed-auth
```

From this repository:

```sh
npm run claude:fast -- --managed-auth
```

If you see a managed-login warning, remove `--managed-auth`. Claude managed credentials are sent only to the local router; your NVIDIA key is sent to NVIDIA by the router.

The fast script and default wrapper route `claude-3-5-sonnet-latest` to NVIDIA `nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16`. Use `npm run claude:glm` for the slower thinking-heavy GLM quality profile, `npm run claude:qwen` for the Nano fallback, or `npm run claude:smoke` to test routing with the smallest configured model.

Model tradeoffs:

- `fast`: best default for long prompts and coding; slower than smaller models, but much less likely to hit context limits
- `glm`: stronger on hard tasks when it reasons longer, but slower
- `qwen`: backup option when you want a lighter fallback, but less consistent on complex code
- `smoke`: smallest and quickest option for health checks, not real work

### Check the router

Test the server:

```sh
curl http://localhost:8082/health
```

Send a Claude-style request:

```sh
curl http://localhost:8082/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: dummy" \
  -d '{
    "model": "claude-3-5-sonnet-latest",
    "max_tokens": 4096,
    "messages": [
      {
        "role": "user",
        "content": "Write a TypeScript function that reverses a string."
      }
    ]
  }'
```

## Configure

### NVIDIA setup

V1 is configured to use NVIDIA NIM by default.

1. Put your NVIDIA API key in `.env`:

```env
NVIDIA_API_KEY=your_nvidia_key_here
CLAUDIA_CONFIG=./config.json
LOG_LEVEL=info
```

2. Keep `defaultBackend` set to `nvidia` in `config.json`.

3. Use a mapped Claude-style model alias such as `claude-3-5-sonnet-latest`, or send any model name and Claudia Router will use the NVIDIA backend default model (`nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16`).

If you want to switch providers later, use `npm run init -- --provider openrouter` or `npm run init -- --provider local`. Use `npm run config` if you prefer the interactive provider picker.

If you want to switch local Claude profiles without editing `.env`, run `npm run profile` and choose a preset, or use `npm run profile -- fast`, `npm run profile -- glm`, `npm run profile -- qwen`, `npm run profile -- list`, or `npm run profile -- toggle`.

Use `npm run profile -- show` to see the current active profile. Use `npm run status` to see the active profile plus the next command to run.

### Automation

For repeatable installs or CI, `npm run init` also accepts:

- `--provider nvidia|openrouter|local` to override the default
- `--yes` to skip confirmation prompts
- `--skip-smoke` to skip the provider smoke test
- `--api-key-env NAME` to read the key from an existing environment variable

Example:

```sh
NVIDIA_API_KEY=your_key npm run init -- --yes --api-key-env NVIDIA_API_KEY
```

### Configuration example

See the config example and model routing details later in this README if you need to customize backends or model aliases.

## Validate

### Quick checks

```sh
npm run doctor
npm run status
```

### Development checks

```sh
npm run typecheck
npm test
npm run build
npm run release:smoke
npm run release:check
```

### Server checks

```sh
curl http://localhost:8082/health
curl http://localhost:8082/v1/messages
```

## Publishing

Before publishing to npm:

1. Run `npm run publish:check`.
2. Run `npm publish` from a clean, tagged working tree.
3. Verify a fresh machine can install and launch with `npm install -g claudia-router`.
4. Verify `npx claudia-router init` works if you do not want a global install.

`npm run release:smoke` performs a clean-package install check by running `npm pack`, installing that tarball into a fresh temp directory, then validating all setup entry paths: local (`--provider local`), OpenRouter (`--provider openrouter --api-key-env ... --skip-smoke`), and default NVIDIA (`init --api-key-env ... --skip-smoke`), with `claudia-router doctor` after each.

`npm run release:check` is the main release gate. It runs `check` (typecheck + tests), `build`, and `release:smoke`.

`npm run publish:check` is the publish gate. It runs `release:check` and a dry-run pack to verify the npm artifact before publishing.

See [RELEASE_READINESS.md](./RELEASE_READINESS.md) for the requirement-by-requirement audit and current evidence.

## Limitations

Claudia Router is text-only today. It buffers streaming responses until the provider finishes, then returns Anthropic-style SSE events. That is intentional for now, because it keeps NVIDIA, OpenRouter, and local backends predictable while the compatibility tests mature. Live token-by-token passthrough is still on the roadmap, but only after provider stream formats are normalized and covered by tests. Vision, prompt caching, and full Claude Code compatibility are not done yet.

## Reference

- [QUICKSTART.md](./QUICKSTART.md) for the fastest setup path
- [config.example.json](./config.example.json) for the full configuration shape
- [RELEASE_READINESS.md](./RELEASE_READINESS.md) for the release audit and evidence
- [NEXT_STEPS.md](./NEXT_STEPS.md) for the current roadmap and handoff notes

## Contributing

Before opening a pull request:

1. Run `npm run release:check`.
2. Update docs if behavior changes.
3. Add or update tests for user-facing changes.
4. Keep the NVIDIA-first setup path obvious in the README and quickstart docs.

## License

MIT. See [LICENSE](./LICENSE).
