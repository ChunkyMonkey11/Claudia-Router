import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { buildAnthropicStream } from "./anthropic.js";
import { ClaudiaError, errorResponse, toClaudiaError } from "./errors.js";
import { logger } from "./logger.js";
import { routeMessages } from "./router.js";
import type { ClaudiaConfig } from "./types.js";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function createServer(config: ClaudiaConfig) {
  const app = express();

  app.use(express.json({ limit: "1mb" }));
  app.use(attachRequestId);

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      name: "claudia-router",
      version: "0.1.0"
    });
  });

  app.post("/v1/messages", async (req, res, next) => {
    try {
      const result = await routeMessages({
        body: req.body,
        config
      });

      logger.info(
        {
          request_id: req.requestId,
          backend: result.log.backend,
          source_model: result.log.sourceModel,
          target_model: result.log.targetModel,
          latency_ms: result.log.latencyMs,
          status: result.log.status
        },
        "message routed"
      );

      if (isStreamingRequest(req.body)) {
        res.status(200);
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.send(buildAnthropicStream(result.response));
        return;
      }

      res.status(200).json(result.response);
    } catch (error) {
      next(error);
    }
  });

  app.use(handleJsonParseError);
  app.use(handleErrors);

  return app;
}

export function startServer(config: ClaudiaConfig) {
  const app = createServer(config);
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, "claudia-router listening");
  });

  return server;
}

function isStreamingRequest(body: unknown): boolean {
  return typeof body === "object" && body !== null && "stream" in body && body.stream === true;
}

const attachRequestId: RequestHandler = (req, res, next) => {
  req.requestId = req.header("x-request-id") ?? crypto.randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
};

const handleJsonParseError: ErrorRequestHandler = (error, _req, _res, next) => {
  if (error instanceof SyntaxError && "body" in error) {
    next(new ClaudiaError("invalid_request_error", "Invalid JSON request body", 400, error));
    return;
  }

  next(error);
};

const handleErrors: ErrorRequestHandler = (error, req, res, _next) => {
  const claudiaError = toClaudiaError(error);
  const status = claudiaError.statusCode;

  logger.error(
    {
      request_id: req.requestId,
      latency_ms: undefined,
      status,
      error_type: claudiaError.type,
      error_message: claudiaError.message
    },
    "request failed"
  );

  res.status(status).json(errorResponse(claudiaError));
};
