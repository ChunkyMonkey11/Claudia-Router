import { z } from "zod";
import { ClaudiaError } from "./errors.js";
import type {
  AnthropicContentBlock,
  AnthropicMessageRequest,
  AnthropicMessageResponse,
  AnthropicTextBlock,
  AnthropicToolUseBlock
} from "./types.js";

const contentBlockSchema = z
  .object({
    type: z.string()
  })
  .passthrough();

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.union([z.string(), z.array(contentBlockSchema)])
});

const requestSchema = z.object({
  model: z.string().min(1),
  max_tokens: z.number().int().positive(),
  temperature: z.number().min(0).max(2).optional(),
  system: z.union([z.string(), z.array(contentBlockSchema)]).optional(),
  messages: z.array(messageSchema).min(1),
  tools: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        input_schema: z.record(z.unknown())
      })
    )
    .optional(),
  tool_choice: z
    .union([
      z.object({ type: z.literal("auto") }),
      z.object({ type: z.literal("any") }),
      z.object({ type: z.literal("tool"), name: z.string().min(1) })
    ])
    .optional(),
  stream: z.boolean().optional()
});

export function validateAnthropicRequest(body: unknown): AnthropicMessageRequest {
  const result = requestSchema.safeParse(body);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const path = firstIssue?.path.join(".");
    const message = path ? `Missing or invalid field: ${path}` : "Invalid request body";
    throw new ClaudiaError("invalid_request_error", message, 400, result.error);
  }

  return result.data;
}

export function contentToText(content: string | AnthropicContentBlock[] | undefined): string {
  if (!content) {
    return "";
  }

  if (typeof content === "string") {
    return content;
  }

  return content
    .filter((block): block is { type: "text"; text: string } => {
      return block.type === "text" && typeof block.text === "string";
    })
    .map((block) => block.text)
    .join("\n");
}

export function normalizeSystemPrompt(system: AnthropicMessageRequest["system"]): string | undefined {
  const text = contentToText(system).trim();
  return text.length > 0 ? text : undefined;
}

export function buildAnthropicResponse(args: {
  text: string;
  toolUses: AnthropicToolUseBlock[];
  model: string;
  finishReason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}): AnthropicMessageResponse {
  const content: Array<AnthropicTextBlock | AnthropicToolUseBlock> = [];
  if (args.text.trim().length > 0) {
    content.push({
      type: "text",
      text: args.text
    });
  }

  content.push(...args.toolUses);

  return {
    id: `msg_claudia_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
    type: "message",
    role: "assistant",
    model: args.model,
    content,
    stop_reason: args.toolUses.length > 0 ? "tool_use" : mapStopReason(args.finishReason),
    stop_sequence: null,
    usage: args.usage
  };
}

export function buildAnthropicStream(response: AnthropicMessageResponse): string {
  const events = [
    formatSseEvent("message_start", {
      type: "message_start",
      message: {
        ...response,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: 0
        }
      }
    })
  ];

  for (const [index, block] of response.content.entries()) {
    if (block.type === "text") {
      events.push(
        formatSseEvent("content_block_start", {
          type: "content_block_start",
          index,
          content_block: {
            type: "text",
            text: ""
          }
        }),
        formatSseEvent("content_block_delta", {
          type: "content_block_delta",
          index,
          delta: {
            type: "text_delta",
            text: block.text
          }
        })
      );
    } else {
      events.push(
        formatSseEvent("content_block_start", {
          type: "content_block_start",
          index,
          content_block: {
            type: "tool_use",
            id: block.id,
            name: block.name,
            input: {}
          }
        }),
        formatSseEvent("content_block_delta", {
          type: "content_block_delta",
          index,
          delta: {
            type: "input_json_delta",
            partial_json: JSON.stringify(block.input)
          }
        })
      );
    }

    events.push(
      formatSseEvent("content_block_stop", {
        type: "content_block_stop",
        index
      })
    );
  }

  events.push(
    formatSseEvent("message_delta", {
      type: "message_delta",
      delta: {
        stop_reason: response.stop_reason,
        stop_sequence: response.stop_sequence
      },
      usage: {
        output_tokens: response.usage.output_tokens
      }
    }),
    formatSseEvent("message_stop", {
      type: "message_stop"
    })
  );

  return events.join("");
}

function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function mapStopReason(finishReason: string | null): AnthropicMessageResponse["stop_reason"] {
  if (finishReason === "length") {
    return "max_tokens";
  }

  if (finishReason === "stop") {
    return "end_turn";
  }

  return "end_turn";
}
