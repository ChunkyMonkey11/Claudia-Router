# Claudia Router

Claudia Router is a lightweight local Anthropic-compatible proxy that routes Claude-style `/v1/messages` requests to OpenAI-compatible model providers.

It is useful for experimenting with Claude-style coding workflows while using backends such as NVIDIA NIM, OpenRouter, LM Studio, Groq, DeepSeek, or local models.

## What it does

- Accepts Anthropic-style `/v1/messages` requests
- Converts them to OpenAI-compatible `/chat/completions`
- Routes requests based on model aliases
- Returns Anthropic-style responses
- Converts Anthropic tool definitions/results to OpenAI-compatible function tools
- Logs backend, model, latency, and errors

## What it does not do yet

- Token-by-token provider streaming passthrough
- Full Claude Code compatibility guarantee
- Prompt caching
- Vision inputs
- Multimodal content

## Quick Start

Prerequisites:

- Node.js 18 or newer
- Claude Code CLI installed as `claude`
- NVIDIA API key with access to NVIDIA hosted endpoints

```sh
git clone https://github.com/ChunkyMonkey11/Claudia-Router.git
cd Claudia-Router
npm install
npm run setup
```

`npm run setup` checks Node.js and Claude Code, creates `.env` and `config.json`, securely
prompts for your NVIDIA API key when needed, and runs a real NVIDIA smoke request. It
finishes by printing the exact command to start the router.

Start the router:

```sh
npm run dev
```

Run the local prerequisite checks again at any time:

```sh
npm run doctor
```

Optional: install the Claude wrapper command locally:

```sh
npm link
```

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
    "max_tokens": 512,
    "messages": [
      {
        "role": "user",
        "content": "Write a TypeScript function that reverses a string."
      }
    ]
  }'
```

For Claude Code, keep the router running and start Claude in another terminal:

```sh
npm run claude:fast
```

After `npm link`, you can use the wrapper from any coding project:

```sh
cd /path/to/your/project
claudia-claude
```

The wrapper runs the normal `claude` CLI with `ANTHROPIC_BASE_URL` pointed to the local router and the default router model already set. By default, it uses local auth so NVIDIA-only users can run it immediately. Pass normal Claude Code arguments as usual:

```sh
claudia-claude --model claude-3-5-sonnet-glm
```

If you want Claude Code managed login instead, opt in explicitly:

```sh
claudia-claude --managed-auth
```

From this repository, use:

```sh
npm run claude:fast -- --managed-auth
```

If you see a managed-login warning, remove `--managed-auth`. Claude managed credentials are sent only to the local router; your NVIDIA key is sent to NVIDIA by the router.

The fast script and default wrapper route `claude-3-5-sonnet-latest` to NVIDIA `stepfun-ai/step-3.5-flash`. Use `npm run claude:glm` for the slower GLM quality profile, or `npm run claude:smoke` to test routing with the smallest configured model.

## NVIDIA Setup

V1 is configured to use NVIDIA NIM by default.

1. Put your NVIDIA API key in `.env`:

```env
NVIDIA_API_KEY=your_nvidia_key_here
CLAUDIA_CONFIG=./config.json
LOG_LEVEL=info
```

2. Keep `defaultBackend` set to `nvidia` in `config.json`.

3. Use a mapped Claude-style model alias such as `claude-3-5-sonnet-latest`, or send any model name and Claudia Router will use the NVIDIA backend default model.

## Config Example

```json
{
  "port": 8082,
  "defaultBackend": "nvidia",
  "backends": {
    "nvidia": {
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "apiKeyEnv": "NVIDIA_API_KEY",
      "defaultModel": "stepfun-ai/step-3.5-flash"
    },
    "openrouter": {
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKeyEnv": "OPENROUTER_API_KEY",
      "defaultModel": "qwen/qwen-2.5-coder-32b-instruct"
    },
    "local": {
      "baseUrl": "http://localhost:1234/v1",
      "apiKeyEnv": "LOCAL_API_KEY",
      "defaultModel": "local-model"
    }
  },
  "modelProfiles": {
    "claude-3-5-sonnet-latest": {
      "backend": "nvidia",
      "providerModel": "stepfun-ai/step-3.5-flash",
      "retryAttempts": 3,
      "retryBaseDelayMs": 500,
      "notes": "Fast NVIDIA coding profile",
      "capabilities": {
        "toolCalls": true,
        "coding": true
      }
    },
    "claude-opus-4-1": {
      "backend": "nvidia",
      "providerModel": "z-ai/glm4.7",
      "retryAttempts": 3,
      "retryBaseDelayMs": 500,
      "extraBody": {
        "chat_template_kwargs": {
          "enable_thinking": true,
          "clear_thinking": false
        }
      },
      "notes": "Higher-quality GLM coding profile; slower because thinking is enabled",
      "capabilities": {
        "toolCalls": true,
        "coding": true
      }
    },
    "claude-3-5-sonnet-glm": {
      "backend": "nvidia",
      "providerModel": "z-ai/glm4.7",
      "retryAttempts": 3,
      "retryBaseDelayMs": 500,
      "extraBody": {
        "chat_template_kwargs": {
          "enable_thinking": true,
          "clear_thinking": false
        }
      },
      "notes": "Explicit GLM 4.7 profile for harder coding tasks",
      "capabilities": {
        "toolCalls": true,
        "coding": true
      }
    },
    "claude-3-5-sonnet-qwen": {
      "backend": "nvidia",
      "providerModel": "qwen/qwen3.5-122b-a10b",
      "retryAttempts": 3,
      "retryBaseDelayMs": 500,
      "notes": "Qwen fallback NVIDIA coding profile",
      "capabilities": {
        "toolCalls": true,
        "coding": true
      }
    },
    "claude-3-haiku-latest": {
      "backend": "nvidia",
      "providerModel": "nvidia/nemotron-mini-4b-instruct",
      "retryAttempts": 1,
      "retryBaseDelayMs": 250,
      "notes": "Smoke-test/free-small NVIDIA profile",
      "capabilities": {
        "toolCalls": false,
        "coding": false
      }
    }
  },
  "modelMap": {
    "legacy-claude-3-5-sonnet-latest": {
      "backend": "nvidia",
      "model": "stepfun-ai/step-3.5-flash"
    }
  }
}
```

`modelProfiles` is the preferred model routing config. Each key is the incoming Claude-style model alias; `backend` selects a configured backend, and `providerModel` is the model sent to that provider. If both `modelProfiles` and legacy `modelMap` contain the same alias, `modelProfiles` wins. `modelMap` remains supported for simple `{ "backend", "model" }` mappings.

`retryAttempts` is the total number of provider attempts for that profile, including the first request. `retryBaseDelayMs` is the exponential backoff base delay between retryable provider responses. `extraBody` is merged into the provider chat-completions JSON body for model-specific options such as NVIDIA `chat_template_kwargs`. `capabilities` is advisory metadata for humans and future routing policy; it does not force provider behavior.

## NVIDIA Model Set

The default config includes the NVIDIA free/shared endpoint profiles that have worked well with Claude Code-style loops:

| Router alias | NVIDIA model | Intended use |
| --- | --- | --- |
| `claude-3-5-sonnet-latest` | `stepfun-ai/step-3.5-flash` | Fast default for day-to-day coding/tool loops |
| `claude-opus-4-1` | `z-ai/glm4.7` | Slower quality profile with GLM thinking enabled |
| `claude-3-5-sonnet-glm` | `z-ai/glm4.7` | Explicit GLM 4.7 alias for harder coding tasks |
| `claude-3-5-sonnet-qwen` | `qwen/qwen3.5-122b-a10b` | Alternate/fallback coding model |
| `claude-3-haiku-latest` | `nvidia/nemotron-mini-4b-instruct` | Smoke test for auth, routing, retries, and simple requests |

Use the fast default:

```bash
npm run claude:fast
```

Or from any project after `npm link`:

```bash
claudia-claude
```

Switch to GLM for a harder task:

```bash
npm run claude:glm
```

Or:

```bash
claudia-claude --model claude-3-5-sonnet-glm
```

Smoke-test the router:

```bash
npm run claude:smoke
```

## Claude-Style Request Shape

```json
{
  "model": "claude-3-5-sonnet-latest",
  "max_tokens": 1024,
  "temperature": 0.2,
  "system": "You are a helpful coding assistant.",
  "messages": [
    {
      "role": "user",
      "content": "Write a Python function for binary search."
    }
  ]
}
```

Text content blocks are also supported:

```json
{
  "role": "user",
  "content": [
    {
      "type": "text",
      "text": "Fix this code."
    }
  ]
}
```

Non-text blocks are ignored safely in V1.

## Tool Routing

Claudia Router converts Anthropic tool-use shapes to OpenAI-compatible function calling:

- Request `tools` become OpenAI `tools` with `type: "function"`
- Request `tool_choice` becomes OpenAI `tool_choice`
- Assistant `tool_use` blocks become OpenAI assistant `tool_calls`
- User `tool_result` blocks become OpenAI `tool` messages
- Provider `tool_calls` become Anthropic `tool_use` response blocks

This is the compatibility layer Claude Code needs before it can execute local tools such as file reads and writes. Actual tool-call quality depends on the selected backend model and whether that provider supports OpenAI-style function calling.

## Claude Code Gateway Test

Start the router:

```sh
npm run dev
```

Launch Claude Code against the local router:

```sh
ANTHROPIC_BASE_URL=http://localhost:8082 \
ANTHROPIC_MODEL=claude-3-5-sonnet-latest \
ANTHROPIC_DEFAULT_SONNET_MODEL=claude-3-5-sonnet-latest \
ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-3-5-sonnet-latest \
claude --model claude-3-5-sonnet-latest
```

If you want to force managed login here, add `ANTHROPIC_AUTH_TOKEN` and remove the wrapper's default local auth behavior.

Then ask Claude Code to do a safe file operation:

```text
Create hello.md with a one-line greeting.
```

If the file is created, the gateway can route a complete Claude Code tool loop for that operation. If Claude Code only prints a fake `Write(...)` call, inspect the router and provider logs to confirm whether the backend returned structured OpenAI `tool_calls`.

## Supported Providers

Any provider with an OpenAI-compatible `/chat/completions` endpoint should work. The example config includes:

- NVIDIA NIM
- OpenRouter
- LM Studio or another local OpenAI-compatible server

Groq, DeepSeek, Ollama OpenAI-compatible mode, and similar providers can be added by creating another backend entry.

## Provider-Specific Notes

- `local`: no auth header is sent unless you explicitly set a local API key and backend that requires one.
- `nvidia`: async `202` responses are polled via `/status/{requestId}` until completion.
- `openrouter`: standard OpenAI-style JSON responses and error statuses are supported; transient `429/5xx` errors follow retry policy.

## Logging

Claudia Router logs one line per request with request ID, backend, source model, target model, latency, and status.

Prompts are not logged by default.

## Development Checks

```sh
npm run typecheck
npm test
npm run build
```

## Release Checklist

Before tagging a release:

1. Run `npm run typecheck`, `npm test`, and `npm run build`.
2. Verify `/health` returns `200`.
3. Verify a plain `/v1/messages` request returns an Anthropic-style message.
4. Verify Claude Code can create and edit a small file through the router.
5. Rotate any provider keys that were ever committed, pasted into logs, or shared during testing.

## Limitations

- Text-only
- Streaming responses are buffered until the provider completes, then returned as Anthropic SSE events
- No vision
- No perfect Claude Code compatibility guarantee
- Provider quality depends on selected model

## Roadmap

- Token-by-token provider streaming passthrough
- Broader Claude Code compatibility tests
- Request replay logs
- Cost estimation
- Provider fallback
- Simple web dashboard
- Policy layer for blocking risky actions
- Prompt redaction
- Claude Code-specific compatibility tests
