import type { RequestHandler } from "express";
import * as jose from "jose";
import { env } from "../config/env";
import { AppError, errors } from "../lib/httpErrors";
import { prisma } from "../lib/db";
import { verifyAccessToken } from "../lib/jwt";

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw errors.unauthorized("Missing or invalid Authorization header");
    }
    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      throw errors.unauthorized("Missing access token");
    }
    const { sub, tv } = await verifyAccessToken(env, token);

    const user = await prisma.user.findUnique({
      where: { id: sub },
      select: { tokenVersion: true },
    });
    if (!user) {
      throw errors.invalidToken("User no longer exists");
    }
    if (user.tokenVersion !== tv) {
      throw errors.invalidToken("Session has ended. Please sign in again.");
    }

    req.userId = sub;
    next();
  } catch (e) {
    if (e instanceof AppError) {
      next(e);
      return;
    }
    if (
      e instanceof jose.errors.JWTExpired ||
      e instanceof jose.errors.JWTInvalid ||
      e instanceof jose.errors.JWSSignatureVerificationFailed
    ) {
      next(errors.invalidToken());
      return;
    }
    next(e);
  }
};
