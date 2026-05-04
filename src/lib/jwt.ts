import * as jose from "jose";
import type { Env } from "../config/env";
import { errors } from "./httpErrors";

export async function signAccessToken(
  env: Env,
  userId: string,
  tokenVersion: number,
): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
  return new jose.SignJWT({ typ: "access", tv: tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SEC}s`)
    .sign(secret);
}

export async function verifyAccessToken(
  env: Env,
  token: string,
): Promise<{ sub: string; tv: number }> {
  const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
  const { payload } = await jose.jwtVerify(token, secret, {
    algorithms: ["HS256"],
  });
  if (
    payload.typ !== "access" ||
    typeof payload.sub !== "string" ||
    typeof payload.tv !== "number" ||
    !Number.isInteger(payload.tv) ||
    payload.tv < 0
  ) {
    throw errors.invalidToken("Invalid access token payload");
  }
  return { sub: payload.sub, tv: payload.tv };
}
