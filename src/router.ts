import { buildAnthropicResponse, validateAnthropicRequest } from "./anthropic.js";
import { ClaudiaError } from "./errors.js";
import { callOpenAICompatibleBackend, createOpenAIChatRequest } from "./openai.js";
import type { AnthropicMessageResponse, ClaudiaConfig, RouteTarget } from "./types.js";

export interface RouteMessagesResult {
  response: AnthropicMessageResponse;
  log: {
    backend: string;
    sourceModel: string;
    targetModel: string;
    latencyMs: number;
    status: number;
  };
}

export async function routeMessages(args: {
  body: unknown;
  config: ClaudiaConfig;
}): Promise<RouteMessagesResult> {
  const request = validateAnthropicRequest(args.body);
  const target = resolveRouteTarget(args.config, request.model);
  const startedAt = Date.now();

  if (!target.backend.apiKey && target.backendName !== "local") {
    throw new ClaudiaError(
      "authentication_error",
      `Missing API key for backend "${target.backendName}". Set ${target.backend.apiKeyEnv}.`,
      401
    );
  }

  const openAIRequest = createOpenAIChatRequest(request, target.model, target.extraBody);
  const providerResult = await callOpenAICompatibleBackend({
    backend: target.backend,
    request: openAIRequest,
    retryAttempts: target.retryAttempts,
    retryBaseDelayMs: target.retryBaseDelayMs
  });

  const response = buildAnthropicResponse(providerResult);

  return {
    response,
    log: {
      backend: target.backendName,
      sourceModel: request.model,
      targetModel: target.model,
      latencyMs: Date.now() - startedAt,
      status: 200
    }
  };
}

export function resolveRouteTarget(config: ClaudiaConfig, sourceModel: string): RouteTarget {
  const profile = config.modelProfiles?.[sourceModel];
  const mapped = config.modelMap[sourceModel];
  const backendName = profile?.backend ?? mapped?.backend ?? config.defaultBackend;
  const backend = config.backends[backendName];

  if (!backend) {
    throw new ClaudiaError("configuration_error", `Missing backend: ${backendName}`, 500);
  }

  return {
    backendName,
    backend,
    model: profile?.providerModel ?? mapped?.model ?? backend.defaultModel,
    retryAttempts: profile?.retryAttempts,
    retryBaseDelayMs: profile?.retryBaseDelayMs,
    extraBody: profile?.extraBody,
    notes: profile?.notes,
    capabilities: profile?.capabilities
  };
}
