import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: RouteCtx) {
  const authErr = await requireAuth(req);
  if (authErr) return authErr;
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const update: Record<string, unknown> = {};
  // key is immutable; only label and sort_order are editable here.
  if (typeof b?.label === "string" && b.label.trim()) update.label = b.label.trim();
  if (typeof b?.sort_order === "number") update.sort_order = b.sort_order;
  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const supabase = getServerSupabase();
  const { error } = await supabase
    .from("field_definitions")
    .update(update)
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Hard delete: atomically strips the key from every lineup's custom_fields
// and removes the field_definitions row via a Postgres RPC.
export async function DELETE(_req: Request, ctx: RouteCtx) {
  const authErr = await requireAuth(_req);
  if (authErr) return authErr;

  const { id } = await ctx.params;
  const supabase = getServerSupabase();

  const { error } = await supabase.rpc("delete_field_and_strip", {
    p_field_id: id,
  });

  if (error) {
    if (error.message.includes("not found")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// GET usage count for the confirm dialog ("This will permanently remove '<label>' data from all N lineups").
export async function GET(_req: Request, ctx: RouteCtx) {
  const authErr = await requireAuth(_req);
  if (authErr) return authErr;
  const { id } = await ctx.params;
  const supabase = getServerSupabase();
  const { data: row } = await supabase
    .from("field_definitions")
    .select("key")
    .eq("id", id)
    .single();
  if (!row) return NextResponse.json({ count: 0 });
  const key = row.key as string;
  const { data: all } = await supabase
    .from("lineups")
    .select("id, custom_fields");
  const count = (all ?? []).filter(
    (l: { custom_fields: Record<string, string> }) =>
      l.custom_fields && key in l.custom_fields,
  ).length;
  return NextResponse.json({ count });
}
