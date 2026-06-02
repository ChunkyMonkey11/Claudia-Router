import { INTERACTIVE_PROVIDER_CHOICES } from "./providers.mjs";

export const PROFILE_PRESETS = {
  fast: {
    alias: "fast",
    model: "claude-3-5-sonnet-latest",
    description: "Default long-context preset",
    nextCommand: "npm run claude:fast",
    notes: "Default NVIDIA Nemotron Super routing profile; strongest context window, but slower than smaller models"
  },
  glm: {
    alias: "glm",
    model: "claude-3-5-sonnet-glm",
    description: "Thinking-heavy preset",
    nextCommand: "npm run claude:glm",
    notes: "More deliberate reasoning, but slower and better for hard coding tasks"
  },
  qwen: {
    alias: "qwen",
    model: "claude-3-5-sonnet-qwen",
    description: "Fallback preset",
    nextCommand: "npm run claude:qwen",
    notes: "Fallback NVIDIA Nemotron Nano routing profile; useful when the larger default is too heavy"
  },
  smoke: {
    alias: "smoke",
    model: "claude-3-haiku-latest",
    description: "Smallest smoke-test preset",
    nextCommand: "npm run claude:smoke",
    notes: "Fast and cheap for checks, but not intended for real coding work"
  }
};

export const PROFILE_ORDER = ["fast", "glm", "qwen", "smoke"];

const MODEL_TO_ALIAS = Object.fromEntries(
  Object.entries(PROFILE_PRESETS).map(([alias, preset]) => [preset.model, alias])
);

export function getProfileModel(alias) {
  return PROFILE_PRESETS[alias]?.model ?? "";
}

export function getProfileAlias(model) {
  return MODEL_TO_ALIAS[model] ?? "";
}

export function getProfileNextCommand(alias) {
  return PROFILE_PRESETS[alias]?.nextCommand ?? "";
}

export function getAvailableProfileAliases(config) {
  const available = new Set(["fast", "smoke"]);
  const modelProfiles = config?.modelProfiles ?? {};

  if (modelProfiles[PROFILE_PRESETS.glm.model]) {
    available.add("glm");
  }

  if (modelProfiles[PROFILE_PRESETS.qwen.model]) {
    available.add("qwen");
  }

  return PROFILE_ORDER.filter((alias) => available.has(alias));
}

export function buildInteractiveChoices(config) {
  const profileChoices = getAvailableProfileAliases(config).map((alias) => ({
    key: alias,
    kind: "profile",
    profileName: alias,
      label: alias,
      description: PROFILE_PRESETS[alias].description
    }));

  return [...profileChoices, ...INTERACTIVE_PROVIDER_CHOICES];
}

export function buildProfileModelProfiles(providerKey, provider) {
  const modelProfiles = {
    [PROFILE_PRESETS.fast.model]: {
      backend: providerKey,
      providerModel: provider.defaultModel,
      retryAttempts: 3,
      retryBaseDelayMs: 500,
      notes: PROFILE_PRESETS.fast.notes
    },
    [PROFILE_PRESETS.smoke.model]: {
      backend: providerKey,
      providerModel: provider.smokeModel,
      retryAttempts: 1,
      retryBaseDelayMs: 250,
      notes: PROFILE_PRESETS.smoke.notes
    }
  };

  if (providerKey === "nvidia") {
    modelProfiles[PROFILE_PRESETS.glm.model] = {
      backend: providerKey,
      providerModel: "z-ai/glm4.7",
      retryAttempts: 3,
      retryBaseDelayMs: 500,
      extraBody: {
        chat_template_kwargs: {
          enable_thinking: true,
          clear_thinking: false
        }
      },
      notes: PROFILE_PRESETS.glm.notes
    };

    modelProfiles[PROFILE_PRESETS.qwen.model] = {
      backend: providerKey,
      providerModel: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16",
      retryAttempts: 3,
      retryBaseDelayMs: 500,
      notes: PROFILE_PRESETS.qwen.notes
    };
  }

  return modelProfiles;
}

export function renderChooserPrompt(choices) {
  const lines = ["Choose a preset:", ""];

  choices.forEach((choice, index) => {
    lines.push(`  ${index + 1}. ${choice.label} - ${choice.description}`);
  });

  lines.push("");
  lines.push("Press Enter for fast, or type a number/name:");
  return lines.join("\n");
}

export function renderChooserHelp(choices) {
  return [
    "",
    "Available presets:",
    ...choices.map((choice) => `  ${choice.label} - ${choice.description}`)
  ].join("\n");
}
