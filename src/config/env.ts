import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

/** Docker / Compose often set `KEY=` which becomes `""` — treat as unset */
function emptyStringToUndefined<T>(v: T): T | undefined {
  if (v === "" || v === undefined || v === null) return undefined;
  return v;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),

  ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  PASSWORD_RESET_TTL_SEC: z.coerce.number().int().positive().default(3600),

  PASSWORD_RESET_RETURN_TOKEN: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  CORS_ORIGIN: z.preprocess(emptyStringToUndefined, z.string().optional()),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors;
    console.error("Invalid environment configuration:", msg);
    throw new Error("Invalid environment configuration");
  }
  return parsed.data;
}

export const env = parseEnv();
