import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export function hashOpaqueToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token, "utf8").digest("hex");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function generateOpaqueToken(bytesLength = 32): string {
  return randomBytes(bytesLength).toString("base64url");
}
