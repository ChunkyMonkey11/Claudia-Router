import assert from "node:assert/strict";
import test from "node:test";
import { routeMessages } from "../src/router.js";
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
