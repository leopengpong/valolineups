import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { REF_TAGS, revalidateRefTag } from "@/lib/data/reference";

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const update: Record<string, unknown> = {};
  if (typeof b?.name === "string" && b.name.trim()) update.name = b.name.trim();
  if (typeof b?.sort_order === "number") update.sort_order = b.sort_order;
  if (typeof b?.in_competitive_rotation === "boolean")
    update.in_competitive_rotation = b.in_competitive_rotation;
  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const supabase = getServerSupabase();
  const { error } = await supabase.from("maps").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidateRefTag(REF_TAGS.maps);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const supabase = getServerSupabase();
  const { count, error: countErr } = await supabase
    .from("lineups")
    .select("id", { count: "exact", head: true })
    .eq("map_id", id);
  if (countErr)
    return NextResponse.json({ error: countErr.message }, { status: 500 });
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "in_use", count: count ?? 0 },
      { status: 409 },
    );
  }
  const { error } = await supabase.from("maps").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidateRefTag(REF_TAGS.maps);
  return NextResponse.json({ ok: true });
}
