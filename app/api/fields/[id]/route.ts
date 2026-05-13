import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: RouteCtx) {
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

// Hard delete: strip the key from every lineup's custom_fields jsonb, then
// delete the field_definitions row. Single-user / small-dataset: a JS scan is
// fine in lieu of a Postgres function.
export async function DELETE(_req: Request, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const supabase = getServerSupabase();

  const { data: row, error: fetchErr } = await supabase
    .from("field_definitions")
    .select("key")
    .eq("id", id)
    .single();
  if (fetchErr || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const key = row.key as string;

  const { data: all, error: scanErr } = await supabase
    .from("lineups")
    .select("id, custom_fields");
  if (scanErr)
    return NextResponse.json({ error: scanErr.message }, { status: 500 });

  type Row = { id: string; custom_fields: Record<string, string> };
  const toUpdate = (all ?? []).filter(
    (l: Row) => l.custom_fields && key in l.custom_fields,
  ) as Row[];

  for (const l of toUpdate) {
    const next = { ...l.custom_fields };
    delete next[key];
    const { error } = await supabase
      .from("lineups")
      .update({ custom_fields: next })
      .eq("id", l.id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: delErr } = await supabase
    .from("field_definitions")
    .delete()
    .eq("id", id);
  if (delErr)
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, stripped: toUpdate.length });
}

// GET usage count for the confirm dialog ("This will permanently remove '<label>' data from all N lineups").
export async function GET(_req: Request, ctx: RouteCtx) {
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
