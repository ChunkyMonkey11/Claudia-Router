# Claudia Router Quick Start

Get up and running in 2 minutes with your preferred AI provider.

## Fastest Paths

Clone once:

```sh
git clone https://github.com/ChunkyMonkey11/Claudia-Router.git
cd Claudia-Router
npm install
```

NVIDIA default:

```sh
npm run init
npm run dev
npm run claude:fast
```

Local no-key:

```sh
npm run init -- --provider local
npm run dev
claudia-claude --model local-model
```

If setup fails, run:

```sh
npm run doctor
```

---

## Prerequisites (All Providers)

- Node.js 18 or newer
- Claude Code CLI installed (`claude` in your PATH)
- Terminal with interactive capability (TTY)

---

## Option 1: NVIDIA NIM (Recommended for Quality)

NVIDIA hosted models like `stepfun-ai/step-3.5-flash` and `z-ai/glm4.7`.
From the cloned repo root:

```sh
# 1. Run the one-command setup flow
npm run init

# 2. When prompted, enter your NVIDIA API key
#    - The setup flow uses NVIDIA by default
#    - It will test connectivity automatically

# 3. Start the router
npm run dev

# 4. Open another terminal and launch Claude
npm run claude:fast
```

**Need an NVIDIA API key?** Get one at [NVIDIA NIM](https://build.nvidia.com/).

---

## Option 2: OpenRouter (Many Models)

Access to many models (Qwen, Claude, Llama, etc.) via OpenRouter.
From the cloned repo root:

```sh
# 1. Run setup for OpenRouter
npm run init -- --provider openrouter

# 2. When prompted, enter your OpenRouter API key

# 3. Start the router
npm run dev

# 4. Launch Claude
claudia-claude --model claude-3-5-sonnet-latest
```

**Need an OpenRouter key?** Get one at [OpenRouter](https://openrouter.ai/).

---

## Option 3: Local Models (LM Studio / Ollama)

Use models running on your own machine.
From the cloned repo root:

```sh
# 1. Start your local model server
# For LM Studio: http://localhost:1234/v1
# For Ollama: ollama serve (then configure baseUrl to http://localhost:11434/v1)

# 2. Run setup for local models
npm run init -- --provider local

# 3. Local uses a dummy API key by default

# 4. Start the router
npm run dev

# 5. Test it
curl http://localhost:8082/health

# 6. Launch Claude
claudia-claude --model local-model
```

---

## Common Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the router (development mode with logging) |
| `npm start` | Start the router (production build) |
| `npm run init` | First-run setup (default NVIDIA) |
| `npm run doctor` | Check prerequisites and configuration |
| `npm run release:check` | Release gate: typecheck + tests + build + package smoke |
| `npm run config` | Re-run the configuration wizard |
| `claudia-claude` | Launch Claude Code connected to the router |
| `npm run claude:fast` | Fast coding model (stepfun-ai/step-3.5-flash) |
| `npm run claude:glm` | High-quality model with thinking (z-ai/glm4.7) |
| `npm run claude:smoke` | Quick smoke test (nemotron-mini-4b) |

---

## Verify Installation

After starting the router (`npm run dev`), check health:

```sh
curl http://localhost:8082/health
```

Expected response:
```json
{
  "ok": true,
  "name": "claudia-router",
  "version": "0.1.0"
}
```

Test a Claude-style request:

```sh
curl http://localhost:8082/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: dummy" \
  -d '{
    "model": "claude-3-5-sonnet-latest",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Say hello"}]
  }'
```

---

## Troubleshooting

### "Claude Code CLI not found"
Install Claude Code: https://docs.anthropic.com/en/docs/claude-code/getting-started

### Port 8082 already in use
Change the port in `config.json` and restart the router.

### Router won't start
Run `npm run doctor` to diagnose common issues:

```sh
npm run doctor
```

### Claude says "Anthropic API key is invalid"
Make sure your router is running and `ANTHROPIC_BASE_URL` is set to `http://localhost:8082`. The `claudia-claude` wrapper sets this automatically.

### Need to switch providers later?
Run `npm run init -- --provider openrouter` or `npm run init -- --provider local`, or use `npm run config` for the interactive wizard.

---

## What's Next?

- Read the full [README.md](README.md) for advanced configuration
- Learn about [model profiles](README.md#config-example) for custom routing
- Check the [Roadmap](README.md#roadmap) for upcoming features
- For scripted installs, see the `Automation` section in [README.md](README.md)
