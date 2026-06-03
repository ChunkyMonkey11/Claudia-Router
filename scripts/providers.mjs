export const PROVIDERS = {
  nvidia: {
    key: "nvidia",
    name: "NVIDIA NIM",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    apiKeyEnv: "NVIDIA_API_KEY",
    defaultModel: "nvidia/nemotron-3-super-120b-a12b",
    smokeModel: "nvidia/nemotron-mini-4b-instruct",
    requiresKey: true,
    description: "Long-context and coding-capable models hosted by NVIDIA"
  },
  openrouter: {
    key: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    defaultModel: "qwen/qwen-2.5-coder-32b-instruct",
    smokeModel: "qwen/qwen-2.5-coder-32b-instruct",
    requiresKey: true,
    description: "Access to many models through OpenRouter"
  },
  local: {
    key: "local",
    name: "Local (LM Studio/Ollama/etc)",
    baseUrl: "http://localhost:1234/v1",
    apiKeyEnv: "LOCAL_API_KEY",
    defaultModel: "local-model",
    smokeModel: "local-model",
    requiresKey: false,
    description: "Local models via OpenAI-compatible server"
  }
};

export const PROVIDER_ORDER = ["nvidia", "openrouter", "local"];

export const INTERACTIVE_PROVIDER_CHOICES = PROVIDER_ORDER.map((providerKey) => ({
  key: providerKey,
  kind: "provider",
  providerKey,
  label: providerKey,
  description: providerDescription(providerKey)
}));

export const PLACEHOLDER_KEYS = new Set(["your_nvidia_key_here", "your_actual_key", "replace_me"]);

export function getProvider(providerKey) {
  return PROVIDERS[providerKey] ?? null;
}

export function getProviderApiKeyEnv(providerKey) {
  return getProvider(providerKey)?.apiKeyEnv ?? "NVIDIA_API_KEY";
}

export function getProviderSmokeModel(providerKey) {
  return getProvider(providerKey)?.smokeModel ?? "";
}

export function getProviderDefaultModel(providerKey) {
  return getProvider(providerKey)?.defaultModel ?? "";
}

export function getProviderBaseUrl(providerKey) {
  return getProvider(providerKey)?.baseUrl ?? "";
}

export function providerDescription(providerKey) {
  return getProvider(providerKey)?.description ?? providerKey;
}

export function providerName(providerKey) {
  return getProvider(providerKey)?.name ?? providerKey;
}

export function isConfiguredProviderKey(providerKey, keyValue) {
  if (!keyValue) {
    return false;
  }

  return !PLACEHOLDER_KEYS.has(keyValue.trim().toLowerCase());
}
