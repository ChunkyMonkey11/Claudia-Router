import assert from "node:assert/strict";
import test from "node:test";
import { resolveRouteTarget, routeMessages } from "../src/router.js";
import type { ClaudiaConfig, OpenAIChatRequest } from "../src/types.js";

test("routes Anthropic tool requests to OpenAI tools and returns tool_use blocks", async () => {
  let providerRequest: OpenAIChatRequest | undefined;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_url, init) => {
    providerRequest = JSON.parse(String(init?.body)) as OpenAIChatRequest;

    return new Response(
      JSON.stringify({
        model: "test-model",
        choices: [
          {
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                {
                  id: "call_write",
                  type: "function",
                  function: {
                    name: "Write",
                    arguments: "{\"path\":\"hello.md\",\"content\":\"# Hello\"}"
                  }
                }
              ]
            },
            finish_reason: "tool_calls"
          }
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 8
        }
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  };

  try {
    const config: ClaudiaConfig = {
      port: 8082,
      defaultBackend: "local",
      backends: {
        local: {
          baseUrl: "http://provider.test/v1",
          apiKeyEnv: "LOCAL_API_KEY",
          defaultModel: "test-model"
        }
      },
      modelMap: {
        "claude-3-5-sonnet-latest": {
          backend: "local",
          model: "test-model"
        }
      },
      modelProfiles: {}
    };

    const result = await routeMessages({
      config,
      body: {
        model: "claude-3-5-sonnet-latest",
        max_tokens: 128,
        messages: [
          {
            role: "user",
            content: "Create hello.md"
          }
        ],
        tools: [
          {
            name: "Write",
            input_schema: {
              type: "object"
            }
          }
        ]
      }
    });

    assert.equal(providerRequest?.tools?.[0]?.function.name, "Write");
    assert.equal(result.response.stop_reason, "tool_use");
    assert.deepEqual(result.response.content, [
      {
        type: "tool_use",
        id: "call_write",
        name: "Write",
        input: {
          path: "hello.md",
          content: "# Hello"
        }
      }
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolves model profiles with routing metadata before legacy modelMap entries", () => {
  const config: ClaudiaConfig = {
    port: 8082,
    defaultBackend: "local",
    backends: {
      local: {
        baseUrl: "http://local.test/v1",
        apiKeyEnv: "LOCAL_API_KEY",
        defaultModel: "local-default"
      },
      remote: {
        baseUrl: "http://remote.test/v1",
        apiKeyEnv: "REMOTE_API_KEY",
        defaultModel: "remote-default"
      }
    },
    modelMap: {
      "claude-3-5-sonnet-latest": {
        backend: "local",
        model: "legacy-model"
      }
    },
    modelProfiles: {
      "claude-3-5-sonnet-latest": {
        backend: "remote",
        providerModel: "provider-model",
        retryAttempts: 4,
        retryBaseDelayMs: 250,
        extraBody: {
          chat_template_kwargs: {
            enable_thinking: true
          }
        },
        notes: "prefer for tool use",
        capabilities: {
          toolUse: true,
          vision: false
        }
      }
    }
  };

  const target = resolveRouteTarget(config, "claude-3-5-sonnet-latest");

  assert.equal(target.backendName, "remote");
  assert.equal(target.backend, config.backends.remote);
  assert.equal(target.model, "provider-model");
  assert.equal(target.retryAttempts, 4);
  assert.equal(target.retryBaseDelayMs, 250);
  assert.deepEqual(target.extraBody, {
    chat_template_kwargs: {
      enable_thinking: true
    }
  });
  assert.equal(target.notes, "prefer for tool use");
  assert.deepEqual(target.capabilities, {
    toolUse: true,
    vision: false
  });
});

test("uses model profile retry settings for provider calls", async () => {
  let attempts = 0;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    attempts += 1;

    if (attempts === 1) {
      return new Response(JSON.stringify({ status: 429, title: "Too Many Requests" }), {
        status: 429,
        headers: {
          "content-type": "application/json"
        }
      });
    }

    return new Response(
      JSON.stringify({
        model: "test-model",
        choices: [
          {
            message: {
              role: "assistant",
              content: "ok"
            },
            finish_reason: "stop"
          }
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1
        }
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  };

  try {
    const config: ClaudiaConfig = {
      port: 8082,
      defaultBackend: "local",
      backends: {
        local: {
          baseUrl: "http://provider.test/v1",
          apiKeyEnv: "LOCAL_API_KEY",
          defaultModel: "default-model"
        }
      },
      modelMap: {},
      modelProfiles: {
        "claude-3-5-sonnet-latest": {
          backend: "local",
          providerModel: "test-model",
          retryAttempts: 2,
          retryBaseDelayMs: 0
        }
      }
    };

    const result = await routeMessages({
      config,
      body: {
        model: "claude-3-5-sonnet-latest",
        max_tokens: 128,
        messages: [
          {
            role: "user",
            content: "Say ok"
          }
        ]
      }
    });

    assert.equal(attempts, 2);
    assert.equal(result.response.content[0]?.type, "text");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
