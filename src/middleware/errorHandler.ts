import type { ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import * as jose from "jose";
import { ZodError } from "zod";
import { AppError } from "../lib/httpErrors";

function getClientErrorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const o = err as { statusCode?: unknown; status?: unknown };
  if (typeof o.statusCode === "number" && o.statusCode >= 400 && o.statusCode < 500) {
    return o.statusCode;
  }
  if (typeof o.status === "number" && o.status >= 400 && o.status < 500) {
    return o.status;
  }
  return undefined;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: err.flatten(),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  if (err instanceof jose.errors.JWTExpired) {
    res.status(401).json({
      error: { code: "TOKEN_EXPIRED", message: "Access token has expired" },
    });
    return;
  }

  if (err instanceof jose.errors.JWTInvalid || err instanceof jose.errors.JWSSignatureVerificationFailed) {
    res.status(401).json({
      error: { code: "INVALID_TOKEN", message: "Invalid access token" },
    });
    return;
  }

  const typedErr = err as { type?: string };
  if (typedErr.type === "entity.parse.failed") {
    res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message:
          "Request body is not valid JSON. Common in Postman: the refresh token must be a quoted string — use a line like \"refreshToken\": \"<token>\" or \"refreshToken\": \"{{refreshToken}}\". If you write \"refreshToken\": {{refreshToken}} without quotes around the variable, JSON is invalid.",
      },
    });
    return;
  }

  // body-parser / express: invalid JSON, payload too large, etc. (http-errors with 4xx status)
  const clientStatus = getClientErrorStatus(err);
  if (clientStatus !== undefined) {
    res.status(clientStatus).json({
      error: {
        code: "REQUEST_ERROR",
        message: err instanceof Error ? err.message : "Request error",
      },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    console.error("Prisma known error:", err.code, err.message, err.meta);
    if (err.code === "P2002") {
      res.status(409).json({
        error: { code: "CONFLICT", message: "Unique constraint violation" },
      });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "Record not found" },
      });
      return;
    }
    if (err.code === "P1001") {
      res.status(503).json({
        error: { code: "DATABASE_UNAVAILABLE", message: "Cannot reach database" },
      });
      return;
    }
    res.status(500).json({
      error: {
        code: "DATABASE_ERROR",
        message: process.env.NODE_ENV === "production" ? "Database error" : err.message,
      },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    console.error("Prisma validation error:", err.message);
    res.status(400).json({
      error: {
        code: "DATABASE_VALIDATION",
        message: process.env.NODE_ENV === "production" ? "Invalid database request" : err.message,
      },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    console.error("Prisma init error:", err.message);
    res.status(503).json({
      error: { code: "DATABASE_UNAVAILABLE", message: "Database client failed to initialize" },
    });
    return;
  }

  console.error("Unhandled error:", err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
  });
};
