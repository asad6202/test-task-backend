export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errors = {
  validation: (message: string, details?: unknown) =>
    new AppError("VALIDATION_ERROR", 400, message, details),

  unauthorized: (message = "Unauthorized") => new AppError("UNAUTHORIZED", 401, message),

  forbidden: (message = "Forbidden") => new AppError("FORBIDDEN", 403, message),

  notFound: (message = "Not found") => new AppError("NOT_FOUND", 404, message),

  conflict: (message: string) => new AppError("CONFLICT", 409, message),

  invalidCredentials: () =>
    new AppError("INVALID_CREDENTIALS", 401, "Invalid email or password"),

  invalidToken: (message = "Invalid or expired token") =>
    new AppError("INVALID_TOKEN", 401, message),

  badRequest: (message: string) => new AppError("BAD_REQUEST", 400, message),
} as const;
