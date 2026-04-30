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

function mapStopReason(finishReason: string | null): AnthropicMessageResponse["stop_reason"] {
  if (finishReason === "length") {
    return "max_tokens";
  }

  if (finishReason === "stop") {
    return "end_turn";
  }

  return "end_turn";
}
