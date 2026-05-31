import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createServer } from "../src/server.js";
import type { ClaudiaConfig, OpenAIChatRequest } from "../src/types.js";

function createTestConfig(overrides: Partial<ClaudiaConfig> = {}): ClaudiaConfig {
  return {
    port: 0,
    defaultBackend: "local",
    backends: {
      local: {
        baseUrl: "http://provider.test/v1",
        apiKeyEnv: "LOCAL_API_KEY",
        defaultModel: "test-model"
      }
    },
    modelMap: {},
    modelProfiles: {},
    ...overrides
  };
}

async function withRunningServer(
  config: ClaudiaConfig,
  callback: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = createServer(config).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    await callback(`http://localhost:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

test("e2e multi-turn keeps prior context in provider request", async () => {
  const originalFetch = globalThis.fetch;
  let providerRequest: OpenAIChatRequest | undefined;

  globalThis.fetch = async (input, init) => {
    if (String(input) === "http://provider.test/v1/chat/completions") {
      providerRequest = JSON.parse(String(init?.body)) as OpenAIChatRequest;
      return new Response(
        JSON.stringify({
          model: "test-model",
          choices: [
            {
              message: {
                role: "assistant",
                content: "The answer is still Paris."
              },
              finish_reason: "stop"
            }
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 4
          }
        }),
        { status: 200 }
      );
    }

    return originalFetch(input, init);
  };

  try {
    await withRunningServer(createTestConfig(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-latest",
          max_tokens: 64,
          messages: [
            {
              role: "user",
              content: "What is the capital of France?"
            },
            {
              role: "assistant",
              content: "Paris."
            },
            {
              role: "user",
              content: "Repeat only the city."
            }
          ]
        })
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(providerRequest?.messages.length, 3);
      assert.deepEqual(providerRequest?.messages[0], {
        role: "user",
        content: "What is the capital of France?"
      });
      assert.deepEqual(providerRequest?.messages[1], {
        role: "assistant",
        content: "Paris."
      });
      assert.deepEqual(providerRequest?.messages[2], {
        role: "user",
        content: "Repeat only the city."
      });
      assert.equal(body.content?.[0]?.type, "text");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("e2e tool call and tool result round-trip shape is preserved", async () => {
  const originalFetch = globalThis.fetch;
  let providerRequest: OpenAIChatRequest | undefined;

  globalThis.fetch = async (input, init) => {
    if (String(input) === "http://provider.test/v1/chat/completions") {
      providerRequest = JSON.parse(String(init?.body)) as OpenAIChatRequest;
      return new Response(
        JSON.stringify({
          model: "test-model",
          choices: [
            {
              message: {
                role: "assistant",
                content: "Done reading file."
              },
              finish_reason: "stop"
            }
          ],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 6
          }
        }),
        { status: 200 }
      );
    }

    return originalFetch(input, init);
  };

  try {
    await withRunningServer(createTestConfig(), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-latest",
          max_tokens: 64,
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "tool_use",
                  id: "toolu_123",
                  name: "Read",
                  input: {
                    path: "README.md"
                  }
                }
              ]
            },
            {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: "toolu_123",
                  content: "file content"
                }
              ]
            }
          ]
        })
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(providerRequest?.messages, [
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "toolu_123",
              type: "function",
              function: {
                name: "Read",
                arguments: "{\"path\":\"README.md\"}"
              }
            }
          ]
        },
        {
          role: "tool",
          tool_call_id: "toolu_123",
          content: "file content"
        }
      ]);
      assert.equal(body.content?.[0]?.type, "text");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("e2e malformed request returns clear 400 invalid_request_error", async () => {
  await withRunningServer(createTestConfig(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-latest",
        messages: [
          {
            role: "user",
            content: "Missing max_tokens"
          }
        ]
      })
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.type, "error");
    assert.equal(body.error?.type, "invalid_request_error");
    assert.match(String(body.error?.message ?? ""), /max_tokens/);
  });
});

test("e2e provider 503 retries then returns mapped provider error", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  globalThis.fetch = async (input, init) => {
    if (String(input) === "http://provider.test/v1/chat/completions") {
      attempts += 1;
      return new Response(
        JSON.stringify({
          error: "temporarily unavailable"
        }),
        {
          status: 503,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    }

    return originalFetch(input, init);
  };

  try {
    await withRunningServer(
      createTestConfig({
        modelProfiles: {
          "claude-3-5-sonnet-latest": {
            backend: "local",
            providerModel: "test-model",
            retryAttempts: 2,
            retryBaseDelayMs: 0
          }
        }
      }),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            model: "claude-3-5-sonnet-latest",
            max_tokens: 64,
            messages: [
              {
                role: "user",
                content: "Say hello"
              }
            ]
          })
        });
        const body = await response.json();

        assert.equal(attempts, 2);
        assert.equal(response.status, 502);
        assert.equal(body.error?.type, "provider_error");
        assert.match(String(body.error?.message ?? ""), /HTTP 503/);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
