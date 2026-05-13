import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  computeAuthHash,
  getAuthEnv,
  timingSafeEqualStr,
} from "@/lib/auth";

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Verify the auth cookie. Anything else → 302 to /login.
  const cookie = req.cookies.get(AUTH_COOKIE)?.value ?? "";
  if (!cookie) return redirectToLogin(req, pathname + search);

  try {
    const { password, secret } = getAuthEnv();
    const expected = await computeAuthHash(password, secret);
    if (!timingSafeEqualStr(cookie, expected)) {
      return redirectToLogin(req, pathname + search);
    }
  } catch {
    return redirectToLogin(req, pathname + search);
  }

  return NextResponse.next();
}

function redirectToLogin(req: NextRequest, originalPath: string) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (originalPath && originalPath !== "/login") {
    url.searchParams.set("redirect", originalPath);
  }
  return NextResponse.redirect(url);
}

// Run on every route except: /login page, /api/auth/login, Next internals, and
// static assets.
export const config = {
  matcher: [
    "/((?!login|api/auth/login|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.*|apple-icon.*).*)",
  ],
};
