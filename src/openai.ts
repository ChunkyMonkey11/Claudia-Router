import { ClaudiaError } from "./errors.js";
import { contentToText, normalizeSystemPrompt } from "./anthropic.js";
import type {
  AnthropicMessageRequest,
  AnthropicContentBlock,
  AnthropicToolResultBlock,
  AnthropicToolUseBlock,
  BackendConfig,
  OpenAIChatRequest,
  OpenAIChatResponse,
  OpenAIToolCall,
  ProviderResult
} from "./types.js";

const PROVIDER_TIMEOUT_MS = 120_000;

export function createOpenAIChatRequest(request: AnthropicMessageRequest, model: string): OpenAIChatRequest {
  const messages: OpenAIChatRequest["messages"] = [];
  const systemPrompt = normalizeSystemPrompt(request.system);

  if (systemPrompt) {
    messages.push({
      role: "system",
      content: systemPrompt
    });
  }

  for (const message of request.messages) {
    const convertedMessages = convertAnthropicMessage(message);
    messages.push(...convertedMessages);
  }

  if (messages.length === 0) {
    throw new ClaudiaError("invalid_request_error", "Request contains no text content", 400);
  }

  const openAIRequest: OpenAIChatRequest = {
    model,
    messages,
    max_tokens: request.max_tokens,
    temperature: request.temperature
  };

  if (request.tools?.length) {
    openAIRequest.tools = request.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema
      }
    }));
  }

  if (request.tool_choice) {
    openAIRequest.tool_choice = mapToolChoice(request.tool_choice);
  }

  return openAIRequest;
}

function convertAnthropicMessage(
  message: AnthropicMessageRequest["messages"][number]
): OpenAIChatRequest["messages"] {
  if (typeof message.content === "string") {
    return message.content.trim().length > 0
      ? [
          {
            role: message.role,
            content: message.content
          }
        ]
      : [];
  }

  if (message.role === "assistant") {
    const text = contentToText(message.content);
    const toolCalls = message.content
      .filter(isToolUseBlock)
      .map((block) => ({
        id: block.id,
        type: "function" as const,
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input ?? {})
        }
      }));

    if (text.trim().length === 0 && toolCalls.length === 0) {
      return [];
    }

    return [
      {
        role: "assistant",
        content: text.trim().length > 0 ? text : null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined
      }
    ];
  }

  const converted: OpenAIChatRequest["messages"] = [];
  const text = contentToText(message.content);
  if (text.trim().length > 0) {
    converted.push({
      role: "user",
      content: text
    });
  }

  for (const block of message.content) {
    if (!isToolResultBlock(block)) {
      continue;
    }

    converted.push({
      role: "tool",
      tool_call_id: block.tool_use_id,
      content: toolResultContentToText(block.content)
    });
  }

  return converted;
}

function toolResultContentToText(content: string | AnthropicContentBlock[] | undefined): string {
  if (!content) {
    return "";
  }

  return contentToText(content);
}

function isToolUseBlock(block: AnthropicContentBlock): block is AnthropicToolUseBlock {
  return (
    block.type === "tool_use" &&
    "id" in block &&
    typeof block.id === "string" &&
    "name" in block &&
    typeof block.name === "string"
  );
}

function isToolResultBlock(block: AnthropicContentBlock): block is AnthropicToolResultBlock {
  return (
    block.type === "tool_result" &&
    "tool_use_id" in block &&
    typeof block.tool_use_id === "string"
  );
}

function mapToolChoice(toolChoice: NonNullable<AnthropicMessageRequest["tool_choice"]>): OpenAIChatRequest["tool_choice"] {
  if (toolChoice.type === "auto") {
    return "auto";
  }

  if (toolChoice.type === "any") {
    return "required";
  }

  return {
    type: "function",
    function: {
      name: toolChoice.name
    }
  };
}

export async function callOpenAICompatibleBackend(args: {
  backend: BackendConfig;
  request: OpenAIChatRequest;
}): Promise<ProviderResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (args.backend.apiKey) {
      headers.Authorization = `Bearer ${args.backend.apiKey}`;
    }

    const response = await fetch(`${args.backend.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(args.request),
      signal: controller.signal
    });

    const bodyText = await response.text();
    if (!response.ok) {
      throw new ClaudiaError(
        "provider_error",
        `Provider returned HTTP ${response.status}: ${truncateProviderBody(bodyText)}`,
        response.status >= 500 ? 502 : 400
      );
    }

    let parsed: OpenAIChatResponse;
    try {
      parsed = JSON.parse(bodyText) as OpenAIChatResponse;
    } catch (error) {
      throw new ClaudiaError("provider_error", "Malformed provider response: invalid JSON", 502, error);
    }

    return parseOpenAIChatResponse(parsed, args.request.model);
  } catch (error) {
    if (error instanceof ClaudiaError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new ClaudiaError("provider_error", "Provider request timed out", 504, error);
    }

    throw new ClaudiaError("provider_error", "Provider request failed", 502, error);
  } finally {
    clearTimeout(timeout);
  }
}

export function parseOpenAIChatResponse(response: OpenAIChatResponse, fallbackModel: string): ProviderResult {
  const firstChoice = response.choices?.[0];
  const text = firstChoice?.message?.content ?? "";
  const toolCalls = firstChoice?.message?.tool_calls ?? [];

  if (typeof text !== "string") {
    throw new ClaudiaError("provider_error", "Malformed provider response: missing assistant text", 502);
  }

  const toolUses = toolCalls.map(parseToolCall);

  return {
    text,
    toolUses,
    model: response.model ?? fallbackModel,
    finishReason: firstChoice?.finish_reason ?? null,
    usage: {
      input_tokens: response.usage?.prompt_tokens ?? 0,
      output_tokens: response.usage?.completion_tokens ?? 0
    }
  };
}

function parseToolCall(toolCall: OpenAIToolCall) {
  return {
    type: "tool_use" as const,
    id: toolCall.id,
    name: toolCall.function.name,
    input: parseToolArguments(toolCall.function.arguments)
  };
}

function parseToolArguments(rawArguments: string): unknown {
  if (rawArguments.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(rawArguments);
  } catch {
    return {
      raw_arguments: rawArguments
    };
  }
}

function truncateProviderBody(body: string): string {
  if (!body) {
    return "empty response body";
  }

  return body.length > 500 ? `${body.slice(0, 500)}...` : body;
}
