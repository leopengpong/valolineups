import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof b?.name === "string" ? b.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("maps")
    .insert({ name })
    .select("id, name")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
