export type AnthropicRole = "user" | "assistant";

export interface AnthropicTextBlock {
  type: "text";
  text: string;
}

export interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content?: string | AnthropicContentBlock[];
  is_error?: boolean;
}

export interface AnthropicUnknownBlock {
  type: string;
  [key: string]: unknown;
}

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock
  | AnthropicUnknownBlock;

export interface AnthropicMessage {
  role: AnthropicRole;
  content: string | AnthropicContentBlock[];
}

export interface AnthropicMessageRequest {
  model: string;
  max_tokens: number;
  temperature?: number;
  system?: string | AnthropicContentBlock[];
  messages: AnthropicMessage[];
  tools?: AnthropicTool[];
  tool_choice?: AnthropicToolChoice;
  stream?: boolean;
}

export interface AnthropicMessageResponse {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: Array<AnthropicTextBlock | AnthropicToolUseBlock>;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use";
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export type AnthropicToolChoice =
  | { type: "auto" }
  | { type: "any" }
  | { type: "tool"; name: string };

export interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: OpenAIToolCall[];
}

export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIChatMessage[];
  max_tokens: number;
  temperature?: number;
  tools?: OpenAITool[];
  tool_choice?: OpenAIToolChoice;
  [key: string]: unknown;
}

export interface OpenAIChatResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export type OpenAIToolChoice =
  | "auto"
  | "required"
  | {
      type: "function";
      function: {
        name: string;
      };
    };

export interface BackendConfig {
  baseUrl: string;
  apiKeyEnv: string;
  defaultModel: string;
  apiKey?: string;
}

export interface ModelMapEntry {
  backend: string;
  model: string;
}

export type ModelCapabilities = Record<string, boolean>;

export interface ModelProfileEntry {
  backend?: string;
  providerModel?: string;
  retryAttempts?: number;
  retryBaseDelayMs?: number;
  extraBody?: Record<string, unknown>;
  notes?: string;
  capabilities?: ModelCapabilities;
}

export interface ClaudiaConfig {
  port: number;
  defaultBackend: string;
  backends: Record<string, BackendConfig>;
  modelMap: Record<string, ModelMapEntry>;
  modelProfiles?: Record<string, ModelProfileEntry>;
}

export interface RouteTarget {
  backendName: string;
  backend: BackendConfig;
  model: string;
  retryAttempts?: number;
  retryBaseDelayMs?: number;
  extraBody?: Record<string, unknown>;
  notes?: string;
  capabilities?: ModelCapabilities;
}

export interface ProviderResult {
  text: string;
  toolUses: AnthropicToolUseBlock[];
  model: string;
  finishReason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}
