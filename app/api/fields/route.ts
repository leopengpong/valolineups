import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { REF_TAGS, revalidateRefTag } from "@/lib/data/reference";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const key = typeof b?.key === "string" ? b.key.trim() : "";
  const label = typeof b?.label === "string" ? b.label.trim() : "";
  const inputType =
    b?.input_type === "textarea" || b?.input_type === "text"
      ? (b.input_type as string)
      : "text";
  if (!key || !label)
    return NextResponse.json(
      { error: "key and label required" },
      { status: 400 },
    );
  if (!/^[a-z][a-z0-9_]*$/.test(key)) {
    return NextResponse.json(
      { error: "key must be snake_case (lowercase, starts with a letter)" },
      { status: 400 },
    );
  }

  const supabase = getServerSupabase();
  const { data: maxRow } = await supabase
    .from("field_definitions")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (maxRow?.sort_order ?? 0) + 10;

  const { data, error } = await supabase
    .from("field_definitions")
    .insert({ key, label, input_type: inputType, sort_order: sortOrder })
    .select("id, key, label, input_type, sort_order")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidateRefTag(REF_TAGS.fields);
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const order = Array.isArray(b?.order) ? b.order : null;
  if (!order)
    return NextResponse.json({ error: "order array required" }, { status: 400 });
  const supabase = getServerSupabase();
  for (const item of order as Array<Record<string, unknown>>) {
    if (typeof item.id !== "string" || typeof item.sort_order !== "number") continue;
    const { error } = await supabase
      .from("field_definitions")
      .update({ sort_order: item.sort_order })
      .eq("id", item.id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
  }
  revalidateRefTag(REF_TAGS.fields);
  return NextResponse.json({ ok: true });
}
