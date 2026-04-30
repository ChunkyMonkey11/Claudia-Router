import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ClaudiaError } from "./errors.js";
import type { ClaudiaConfig } from "./types.js";

const backendSchema = z.object({
  baseUrl: z.string().url(),
  apiKeyEnv: z.string().min(1),
  defaultModel: z.string().min(1)
});

const configSchema = z.object({
  port: z.number().int().positive().default(8082),
  defaultBackend: z.string().min(1),
  backends: z.record(backendSchema).refine((value) => Object.keys(value).length > 0, {
    message: "At least one backend must be configured"
  }),
  modelMap: z
    .record(
      z.object({
        backend: z.string().min(1),
        model: z.string().min(1)
      })
    )
    .default({})
});

export function loadConfig(configPath = process.env.CLAUDIA_CONFIG ?? "./config.json"): ClaudiaConfig {
  const resolvedPath = path.resolve(process.cwd(), configPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new ClaudiaError(
      "configuration_error",
      `Missing config file: ${resolvedPath}. Set CLAUDIA_CONFIG or copy config.example.json to config.json.`,
      500
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    throw new ClaudiaError(
      "configuration_error",
      `Invalid JSON in config file: ${resolvedPath}`,
      500,
      error
    );
  }

  const result = configSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new ClaudiaError(
      "configuration_error",
      `Invalid config: ${result.error.issues.map((issue) => issue.message).join("; ")}`,
      500,
      result.error
    );
  }

  const config = result.data;
  if (!config.backends[config.defaultBackend]) {
    throw new ClaudiaError(
      "configuration_error",
      `Missing backend configured as defaultBackend: ${config.defaultBackend}`,
      500
    );
  }

  for (const [sourceModel, mapping] of Object.entries(config.modelMap)) {
    if (!config.backends[mapping.backend]) {
      throw new ClaudiaError(
        "configuration_error",
        `Model map entry ${sourceModel} references missing backend: ${mapping.backend}`,
        500
      );
    }
  }

  return {
    ...config,
    backends: Object.fromEntries(
      Object.entries(config.backends).map(([name, backend]) => [
        name,
        {
          ...backend,
          baseUrl: backend.baseUrl.replace(/\/+$/, ""),
          apiKey: process.env[backend.apiKeyEnv]
        }
      ])
    )
  };
}
