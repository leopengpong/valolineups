import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { STORAGE_BUCKET } from "@/lib/types";

const ONE_HOUR = 60 * 60;

export async function POST(req: Request) {
  const authErr = await requireAuth(req);
  if (authErr) return authErr;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const paths =
    typeof body === "object" && body !== null && "paths" in body
      ? (body as Record<string, unknown>).paths
      : null;

  if (!Array.isArray(paths) || paths.some((p) => typeof p !== "string")) {
    return NextResponse.json(
      { error: "paths must be a string[]" },
      { status: 400 },
    );
  }
  if (paths.length === 0) {
    return NextResponse.json({ urls: [] });
  }

  const supabase = getServerSupabase();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrls(paths as string[], ONE_HOUR);
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Failed to sign URLs" },
      { status: 500 },
    );
  }
  return NextResponse.json({
    urls: data.map((d) => ({ path: d.path, url: d.signedUrl })),
  });
}
