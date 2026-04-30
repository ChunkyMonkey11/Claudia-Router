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

- Streaming
- Full Claude Code compatibility guarantee
- Prompt caching
- Vision inputs
- Multimodal content

## Quick Start

```sh
git clone https://github.com/YOUR_USERNAME/claudia-router
cd claudia-router
npm install
cp .env.example .env
cp config.example.json config.json
npm run dev
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
      "defaultModel": "qwen/qwen3-coder-480b-a35b-instruct"
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
  "modelMap": {
    "claude-3-5-sonnet-latest": {
      "backend": "nvidia",
      "model": "qwen/qwen3-coder-480b-a35b-instruct"
    }
  }
}
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
ANTHROPIC_AUTH_TOKEN=dummy \
ANTHROPIC_MODEL=claude-3-5-sonnet-latest \
ANTHROPIC_DEFAULT_SONNET_MODEL=claude-3-5-sonnet-latest \
ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-3-5-sonnet-latest \
claude --model claude-3-5-sonnet-latest
```

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
- Non-streaming only
- No vision
- No perfect Claude Code compatibility guarantee
- Provider quality depends on selected model

## Roadmap

- Streaming support
- Broader Claude Code compatibility tests
- Request replay logs
- Cost estimation
- Provider fallback
- Simple web dashboard
- Policy layer for blocking risky actions
- Prompt redaction
- Team config
- Claude Code-specific compatibility tests
