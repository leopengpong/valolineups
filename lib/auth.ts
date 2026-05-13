// Auth helpers. Edge-runtime safe: uses Web Crypto, no node:crypto.
// Cookie value is HMAC-SHA256(APP_PASSWORD, AUTH_SECRET) as hex.

export const AUTH_COOKIE = "auth";
// ~1 year in seconds.
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

export async function computeAuthHash(
  password: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(password));
  return toHex(sig);
}

// Constant-time string comparison. Equivalent to crypto.timingSafeEqual for
// equal-length strings; bails fast on length mismatch (length isn't secret).
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function getAuthEnv(): { password: string; secret: string } {
  const password = process.env.APP_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  if (!password || !secret) {
    throw new Error("APP_PASSWORD and AUTH_SECRET must be set");
  }
  return { password, secret };
}
