import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./modules/auth/auth.routes";
import { healthRouter } from "./modules/health/health.routes";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));
  // Lets clients (e.g. Postman form body) send refreshToken without fragile raw-JSON quoting around variables
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  if (env.CORS_ORIGIN) {
    const origins = env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
    if (origins.length === 1 && origins[0] === "*") {
      app.use(cors({ origin: true }));
    } else if (origins.length > 0) {
      app.use(cors({ origin: origins }));
    }
  }

  app.use(healthRouter);
  app.use(authRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });

  app.use(errorHandler);

  return app;
}
