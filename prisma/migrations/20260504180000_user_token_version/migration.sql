-- Bump invalidates existing access JWTs (logout / password reset increment this)
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
