export type ClaudiaErrorType =
  | "invalid_request_error"
  | "configuration_error"
  | "authentication_error"
  | "provider_error";

export class ClaudiaError extends Error {
  public readonly statusCode: number;
  public readonly type: ClaudiaErrorType;
  public readonly details?: unknown;

  constructor(type: ClaudiaErrorType, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = "ClaudiaError";
    this.type = type;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function errorResponse(error: ClaudiaError | Error) {
  if (error instanceof ClaudiaError) {
    return {
      type: "error",
      error: {
        type: error.type,
        message: error.message
      }
    };
  }

  return {
    type: "error",
    error: {
      type: "provider_error",
      message: "Unexpected server error"
    }
  };
}

export function toClaudiaError(error: unknown): ClaudiaError {
  if (error instanceof ClaudiaError) {
    return error;
  }

  if (error instanceof Error) {
    return new ClaudiaError("provider_error", error.message, 500);
  }

  return new ClaudiaError("provider_error", "Unexpected server error", 500);
}
