import assert from "node:assert/strict";
import test from "node:test";
import {
  callOpenAICompatibleBackend,
  createOpenAIChatRequest,
  parseOpenAIChatResponse,
  providerStatusToClientStatus,
  shouldRetryProviderStatus
} from "../src/openai.js";
import { buildAnthropicResponse, buildAnthropicStream } from "../src/anthropic.js";

test("passes Anthropic tools through as OpenAI function tools", () => {
  const request = createOpenAIChatRequest(
    {
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
          description: "Write a file",
          input_schema: {
            type: "object",
            properties: {
              path: { type: "string" },
              content: { type: "string" }
            },
            required: ["path", "content"]
          }
        }
      ],
      tool_choice: {
        type: "tool",
        name: "Write"
      }
    },
    "qwen/qwen3-coder-480b-a35b-instruct"
  );

  assert.deepEqual(request.tools, [
    {
      type: "function",
      function: {
        name: "Write",
        description: "Write a file",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" }
          },
          required: ["path", "content"]
        }
      }
    }
  ]);
  assert.deepEqual(request.tool_choice, {
    type: "function",
    function: {
      name: "Write"
    }
  });
});

test("merges provider-specific extra body fields into OpenAI requests", () => {
  const request = createOpenAIChatRequest(
    {
      model: "claude-3-5-sonnet-latest",
      max_tokens: 128,
      messages: [
        {
          role: "user",
          content: "Say ok"
        }
      ]
    },
    "z-ai/glm4.7",
    {
      chat_template_kwargs: {
        enable_thinking: true,
        clear_thinking: false
      }
    }
  );

  assert.equal(request.model, "z-ai/glm4.7");
  assert.deepEqual(request.chat_template_kwargs, {
    enable_thinking: true,
    clear_thinking: false
  });
  assert.equal(request.stream, false);
});

test("converts Anthropic tool results into OpenAI tool messages", () => {
  const request = createOpenAIChatRequest(
    {
      model: "claude-3-5-sonnet-latest",
      max_tokens: 128,
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_123",
              name: "Read",
              input: {
                path: "package.json"
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
              content: "package contents"
            }
          ]
        }
      ]
    },
    "qwen/qwen3-coder-480b-a35b-instruct"
  );

  assert.deepEqual(request.messages, [
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "toolu_123",
          type: "function",
          function: {
            name: "Read",
            arguments: "{\"path\":\"package.json\"}"
          }
        }
      ]
    },
    {
      role: "tool",
      tool_call_id: "toolu_123",
      content: "package contents"
    }
  ]);
});

test("converts OpenAI tool calls into Anthropic tool_use response blocks", () => {
  const providerResult = parseOpenAIChatResponse(
    {
      model: "qwen/qwen3-coder-480b-a35b-instruct",
      choices: [
        {
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "call_123",
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
        prompt_tokens: 10,
        completion_tokens: 5
      }
    },
    "fallback-model"
  );

  const response = buildAnthropicResponse(providerResult);

  assert.equal(response.stop_reason, "tool_use");
  assert.deepEqual(response.content, [
    {
      type: "tool_use",
      id: "call_123",
      name: "Write",
      input: {
        path: "hello.md",
        content: "# Hello"
      }
    }
  ]);
});

test("preserves transient provider status semantics", () => {
  assert.equal(providerStatusToClientStatus(429), 429);
  assert.equal(providerStatusToClientStatus(503), 502);
  assert.equal(providerStatusToClientStatus(401), 502);
  assert.equal(providerStatusToClientStatus(400), 400);

  assert.equal(shouldRetryProviderStatus(429), true);
  assert.equal(shouldRetryProviderStatus(503), true);
  assert.equal(shouldRetryProviderStatus(400), false);
});

test("polls pending NVIDIA responses until the result is ready", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];

  globalThis.fetch = async (input) => {
    urls.push(String(input));

    if (urls.length === 1) {
      return new Response(JSON.stringify({ requestId: "request-123" }), {
        status: 202,
        headers: {
          "retry-after": "0"
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
        ]
      }),
      {
        status: 200
      }
    );
  };

  try {
    const result = await callOpenAICompatibleBackend({
      backend: {
        baseUrl: "https://provider.test/v1",
        apiKeyEnv: "TEST_API_KEY",
        defaultModel: "test-model"
      },
      request: {
        model: "test-model",
        messages: [
          {
            role: "user",
            content: "Say ok"
          }
        ],
        max_tokens: 32
      }
    });

    assert.equal(result.text, "ok");
    assert.deepEqual(urls, [
      "https://provider.test/v1/chat/completions",
      "https://provider.test/v1/status/request-123"
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("automatically shrinks completion budget when the provider reports a context overflow", async () => {
  const originalFetch = globalThis.fetch;
  const maxTokensSeen: number[] = [];
  let attempts = 0;

  globalThis.fetch = async (_input, init) => {
    attempts += 1;
    const requestBody = JSON.parse(String(init?.body)) as { max_tokens: number };
    maxTokensSeen.push(requestBody.max_tokens);

    if (attempts === 1) {
      return new Response(
        JSON.stringify({
          error:
            "This model's maximum context length is 4096 tokens. However, you requested 4439 tokens (343 in the messages, 4096 in the completion). Please reduce the length of the messages or completion."
        }),
        {
          status: 400,
          headers: {
            "content-type": "application/json"
          }
        }
      );
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
          prompt_tokens: 343,
          completion_tokens: 12
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
    const result = await callOpenAICompatibleBackend({
      backend: {
        baseUrl: "https://provider.test/v1",
        apiKeyEnv: "TEST_API_KEY",
        defaultModel: "test-model"
      },
      request: {
        model: "test-model",
        messages: [
          {
            role: "user",
            content: "Say ok"
          }
        ],
        max_tokens: 4096
      }
    });

    assert.equal(result.text, "ok");
    assert.deepEqual(maxTokensSeen, [4096, 3752]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("formats completed responses as Anthropic SSE events", () => {
  const stream = buildAnthropicStream({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "test-model",
    content: [
      {
        type: "text",
        text: "Creating the file."
      },
      {
        type: "tool_use",
        id: "toolu_123",
        name: "Write",
        input: {
          path: "hello.md"
        }
      }
    ],
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: {
      input_tokens: 10,
      output_tokens: 5
    }
  });

  assert.match(stream, /event: message_start/);
  assert.match(stream, /"type":"text_delta","text":"Creating the file."/);
  assert.match(stream, /"type":"input_json_delta","partial_json":"{\\"path\\":\\"hello.md\\"}"/);
  assert.match(stream, /"stop_reason":"tool_use"/);
  assert.match(stream, /event: message_stop/);
});
