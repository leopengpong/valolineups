import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { STORAGE_BUCKET } from "@/lib/types";

const MAX_COUNT = 5;

export async function POST(req: Request) {
  const authErr = await requireAuth(req);
  if (authErr) return authErr;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const rawCount =
    typeof body === "object" && body !== null && "count" in body
      ? (body as Record<string, unknown>).count
      : 1;
  const count = Math.min(
    MAX_COUNT,
    Math.max(1, Number.isFinite(Number(rawCount)) ? Number(rawCount) : 1),
  );

  const supabase = getServerSupabase();
  const slots: Array<{ path: string; token: string; signedUrl: string }> = [];

  for (let i = 0; i < count; i++) {
    const path = `${randomUUID()}.jpg`;
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Failed to create upload URL" },
        { status: 500 },
      );
    }
    slots.push({ path: data.path, token: data.token, signedUrl: data.signedUrl });
  }

  return NextResponse.json({ slots });
}
