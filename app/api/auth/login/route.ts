import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  AUTH_COOKIE_MAX_AGE,
  computeAuthHash,
  getAuthEnv,
  timingSafeEqualStr,
} from "@/lib/auth";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const password =
    typeof body === "object" && body !== null && "password" in body
      ? String((body as Record<string, unknown>).password ?? "")
      : "";

  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  const { password: expected, secret } = getAuthEnv();

  if (!timingSafeEqualStr(password, expected)) {
    // Small delay to blunt the most trivial brute-force; not a real defense.
    await new Promise((r) => setTimeout(r, 300));
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const hash = await computeAuthHash(expected, secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, hash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE,
  });
  return res;
}
