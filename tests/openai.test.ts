import assert from "node:assert/strict";
import test from "node:test";
import { createOpenAIChatRequest, parseOpenAIChatResponse } from "../src/openai.js";
import { buildAnthropicResponse } from "../src/anthropic.js";

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
