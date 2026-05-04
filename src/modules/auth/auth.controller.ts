import type { Request, Response } from "express";
import { env } from "../../config/env";
import {
  forgotPasswordBodySchema,
  loginBodySchema,
  logoutBodySchema,
  refreshBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
} from "./auth.schemas";
import * as authService from "./auth.service";

export async function register(req: Request, res: Response): Promise<void> {
  const body = registerBodySchema.parse(req.body);
  const result = await authService.register(env, body.email, body.password);
  res.status(201).json(result);
}

export async function login(req: Request, res: Response): Promise<void> {
  const body = loginBodySchema.parse(req.body);
  const result = await authService.login(env, body.email, body.password);
  res.json(result);
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const body = refreshBodySchema.parse(req.body);
  const result = await authService.refreshSession(env, body.refreshToken);
  res.json(result);
}

export async function logout(req: Request, res: Response): Promise<void> {
  const body = logoutBodySchema.parse(req.body);
  await authService.logout(env, body.refreshToken);
  res.status(204).end();
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const body = forgotPasswordBodySchema.parse(req.body);
  const result = await authService.requestPasswordReset(env, body.email);
  res.json(result);
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const body = resetPasswordBodySchema.parse(req.body);
  const result = await authService.resetPassword(env, body.token, body.newPassword);
  res.json(result);
}

export async function me(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
    return;
  }
  const user = await authService.getMe(userId);
  res.json({ user });
}
