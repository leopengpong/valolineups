import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { deleteStorageObjects, normalizeImages } from "@/lib/lineups";
import type { Lineup, Side } from "@/lib/types";

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: RouteCtx) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const supabase = getServerSupabase();
  const { data: existing, error: fetchErr } = await supabase
    .from("lineups")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const before = existing as Lineup;

  const update: Record<string, unknown> = {};
  if (typeof b.map_id === "string") update.map_id = b.map_id;
  if (typeof b.agent_id === "string") update.agent_id = b.agent_id;
  if (b.side === "attack" || b.side === "defense")
    update.side = b.side as Side;
  if (Array.isArray(b.images)) {
    const images = normalizeImages(b.images);
    if (images.length === 0) {
      return NextResponse.json(
        { error: "At least one image required" },
        { status: 400 },
      );
    }
    update.images = images;
  }
  if (b.custom_fields && typeof b.custom_fields === "object") {
    update.custom_fields = sanitizeCustomFields(
      b.custom_fields as Record<string, unknown>,
    );
  }

  const { error } = await supabase.from("lineups").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Clean up any storage objects that are no longer referenced.
  if (Array.isArray(update.images)) {
    const newPaths = new Set(
      (update.images as Array<{ path: string }>).map((i) => i.path),
    );
    const removed = before.images
      .map((i) => i.path)
      .filter((p) => !newPaths.has(p));
    if (removed.length > 0) {
      await deleteStorageObjects(removed).catch(() => undefined);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const supabase = getServerSupabase();

  const { data: existing, error: fetchErr } = await supabase
    .from("lineups")
    .select("images")
    .eq("id", id)
    .single();
  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const paths = ((existing.images ?? []) as Array<{ path: string }>).map(
    (i) => i.path,
  );

  const { error } = await supabase.from("lineups").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (paths.length > 0) {
    await deleteStorageObjects(paths).catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}

function sanitizeCustomFields(
  input: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string" && v.trim() !== "") out[k] = v;
  }
  return out;
}
