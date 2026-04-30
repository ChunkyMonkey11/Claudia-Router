import { loadConfig } from "./config.js";
import { toClaudiaError } from "./errors.js";
import { logger } from "./logger.js";
import { startServer } from "./server.js";

try {
  const config = loadConfig();
  startServer(config);
} catch (error) {
  const claudiaError = toClaudiaError(error);
  logger.fatal(
    {
      error_type: claudiaError.type,
      error_message: claudiaError.message
    },
    "failed to start claudia-router"
  );
  process.exit(1);
}
