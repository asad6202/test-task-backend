import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth } from "../../middleware/requireAuth";
import * as controller from "./auth.controller";

export const authRouter = Router();

authRouter.post("/auth/register", asyncHandler(controller.register));
authRouter.post("/auth/login", asyncHandler(controller.login));
authRouter.post("/auth/refresh", asyncHandler(controller.refresh));
authRouter.post("/auth/logout", asyncHandler(controller.logout));
authRouter.post("/auth/forgot-password", asyncHandler(controller.forgotPassword));
authRouter.post("/auth/reset-password", asyncHandler(controller.resetPassword));
authRouter.get("/auth/me", requireAuth, asyncHandler(controller.me));
