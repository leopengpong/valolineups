import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof b?.name === "string" ? b.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const supabase = getServerSupabase();
  const { data: maxRow } = await supabase
    .from("maps")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (maxRow?.sort_order ?? 0) + 10;

  const { data, error } = await supabase
    .from("maps")
    .insert({ name, sort_order: sortOrder })
    .select("id, name, sort_order")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Bulk reorder: { order: [{ id, sort_order }, ...] }
export async function PATCH(req: Request) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const order = Array.isArray(b?.order) ? b.order : null;
  if (!order)
    return NextResponse.json({ error: "order array required" }, { status: 400 });

  const supabase = getServerSupabase();
  for (const item of order as Array<Record<string, unknown>>) {
    if (typeof item.id !== "string" || typeof item.sort_order !== "number") continue;
    const { error } = await supabase
      .from("maps")
      .update({ sort_order: item.sort_order })
      .eq("id", item.id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
