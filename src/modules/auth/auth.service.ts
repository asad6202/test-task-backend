import * as argon2 from "argon2";
import type { Env } from "../../config/env";
import { prisma } from "../../lib/db";
import { errors } from "../../lib/httpErrors";
import { signAccessToken } from "../../lib/jwt";
import { generateOpaqueToken, hashOpaqueToken, timingSafeEqualHex } from "../../lib/tokenHash";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashRefresh(env: Env, plain: string): string {
  return hashOpaqueToken(plain, env.JWT_REFRESH_SECRET);
}

async function readTokenVersion(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokenVersion: true },
  });
  if (!user) {
    throw errors.notFound("User not found");
  }
  return user.tokenVersion;
}

export async function register(env: Env, email: string, password: string) {
  const normalized = normalizeEmail(email);
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) {
    throw errors.conflict("An account with this email already exists");
  }

  const passwordHash = await argon2.hash(password);
  const user = await prisma.user.create({
    data: { email: normalized, passwordHash },
    select: { id: true, email: true, createdAt: true },
  });

  const tokens = await issueTokens(env, user.id);
  return { user, ...tokens };
}

export async function login(env: Env, email: string, password: string) {
  const normalized = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) {
    throw errors.invalidCredentials();
  }

  const ok = await argon2.verify(user.passwordHash, password);
  if (!ok) {
    throw errors.invalidCredentials();
  }

  const tokens = await issueTokens(env, user.id);
  return {
    user: { id: user.id, email: user.email, createdAt: user.createdAt },
    ...tokens,
  };
}

async function issueTokens(env: Env, userId: string) {
  const refreshPlain = generateOpaqueToken(32);
  const tokenHash = hashRefresh(env, refreshPlain);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_SEC * 1000);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  const tv = await readTokenVersion(userId);
  const accessToken = await signAccessToken(env, userId, tv);
  return { accessToken, refreshToken: refreshPlain };
}

export async function refreshSession(env: Env, refreshPlain: string) {
  const tokenHash = hashRefresh(env, refreshPlain);
  const row = await prisma.refreshToken.findFirst({
    where: { tokenHash },
  });

  if (!row || !timingSafeEqualHex(row.tokenHash, tokenHash)) {
    throw errors.invalidToken("Invalid or expired refresh token");
  }

  if (row.revokedAt) {
    throw errors.invalidToken("Refresh token has been revoked");
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    throw errors.invalidToken("Refresh token has expired");
  }

  const tv = await readTokenVersion(row.userId);
  const accessToken = await signAccessToken(env, row.userId, tv);
  return { accessToken };
}

export async function logout(env: Env, refreshPlain: string) {
  const tokenHash = hashRefresh(env, refreshPlain);
  const row = await prisma.refreshToken.findFirst({
    where: { tokenHash },
  });

  if (!row || !timingSafeEqualHex(row.tokenHash, tokenHash)) {
    throw errors.invalidToken("Invalid refresh token");
  }

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: row.userId },
      data: { tokenVersion: { increment: 1 } },
    }),
  ]);
}

const forgotPasswordMessage =
  "If an account exists for this email, password reset instructions have been processed.";

export async function requestPasswordReset(env: Env, email: string) {
  const normalized = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalized } });

  if (!user) {
    return { message: forgotPasswordMessage };
  }

  const plain = generateOpaqueToken(32);
  const th = hashRefresh(env, plain);
  const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TTL_SEC * 1000);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: th, expiresAt },
  });

  const shouldReturn =
    env.PASSWORD_RESET_RETURN_TOKEN === true || env.NODE_ENV !== "production";

  if (shouldReturn) {
    return { message: forgotPasswordMessage, resetToken: plain };
  }

  console.info("[password-reset] token issued (not returned in response):", plain);
  return { message: forgotPasswordMessage };
}

export async function resetPassword(env: Env, plainToken: string, newPassword: string) {
  const tokenHash = hashRefresh(env, plainToken);
  const record = await prisma.passwordResetToken.findFirst({
    where: { tokenHash },
  });

  if (!record || !timingSafeEqualHex(record.tokenHash, tokenHash)) {
    throw errors.badRequest("Invalid or expired reset token");
  }
  if (record.usedAt) {
    throw errors.badRequest("Reset token has already been used");
  }
  if (record.expiresAt.getTime() <= Date.now()) {
    throw errors.badRequest("Reset token has expired");
  }

  const passwordHash = await argon2.hash(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  const tokens = await issueTokens(env, record.userId);
  return {
    message: "Password has been reset. Previous sessions have been signed out.",
    ...tokens,
  };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, createdAt: true },
  });
  if (!user) {
    throw errors.notFound("User not found");
  }
  return user;
}
