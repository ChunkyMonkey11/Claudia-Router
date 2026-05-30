/**
 * Logic for building Claude Code environment and arguments.
 * This module is testable and used by claudia-claude.mjs.
 */

/**
 * Build the environment object for the Claude Code subprocess.
 * @param {Record<string, string>} userEnv - The current process.env
 * @param {string} [argsDefaultModel] - Default model from script args (npm run claude:fast uses this)
 * @param {string[]} [args] - Claude Code CLI arguments
 * @returns {Record<string, string>} The environment to pass to the child process
 */
export function buildClaudeEnv(userEnv, argsDefaultModel = undefined, args = []) {
  const model = resolveClaudeModel(args, userEnv.CLAUDIA_CLAUDE_MODEL ?? argsDefaultModel);

  const env = {
    ...userEnv,
    ANTHROPIC_BASE_URL: userEnv.ANTHROPIC_BASE_URL ?? "http://localhost:8082",
    ANTHROPIC_MODEL: userEnv.ANTHROPIC_MODEL ?? model,
    ANTHROPIC_DEFAULT_SONNET_MODEL:
      userEnv.ANTHROPIC_DEFAULT_SONNET_MODEL ?? "claude-3-5-sonnet-latest",
    ANTHROPIC_DEFAULT_HAIKU_MODEL:
      userEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? "claude-3-haiku-latest"
  };

  // Managed-login users should not receive a dummy token because Claude Code
  // warns when managed credentials and ANTHROPIC_AUTH_TOKEN are both present.
  if (userEnv.ANTHROPIC_AUTH_TOKEN) {
    env.ANTHROPIC_AUTH_TOKEN = userEnv.ANTHROPIC_AUTH_TOKEN;
  } else if (usesLocalAuth(args, userEnv)) {
    env.ANTHROPIC_AUTH_TOKEN = "dummy";
  }

  return env;
}

/**
 * Build the Claude Code CLI arguments.
 * @param {string[]} args - The script arguments (from process.argv.slice(2))
 * @param {string} defaultModel - The default model to use if no --model flag is present
 * @returns {string[]} The arguments array for the claude command
 */
export function buildClaudeArgs(args, defaultModel) {
  const claudeArgs = args.filter((arg) => arg !== "--local-auth");
  const hasModelArg = claudeArgs.some((arg, index) =>
    arg === "--model" || arg.startsWith("--model=") || claudeArgs[index - 1] === "--model"
  );
  return hasModelArg ? claudeArgs : ["--model", defaultModel, ...claudeArgs];
}

export function resolveClaudeModel(args, defaultModel = "claude-3-5-sonnet-latest") {
  const modelIndex = args.indexOf("--model");
  if (modelIndex >= 0 && args[modelIndex + 1]) {
    return args[modelIndex + 1];
  }

  const combinedModel = args.find((arg) => arg.startsWith("--model="));
  if (combinedModel) {
    return combinedModel.slice("--model=".length);
  }

  return defaultModel;
}

function usesLocalAuth(args, userEnv) {
  return args.includes("--local-auth") || userEnv.CLAUDIA_LOCAL_AUTH === "1";
}
