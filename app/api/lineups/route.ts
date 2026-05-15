import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  attachSignedUrls,
  listLineups,
  normalizeAbilities,
  normalizeImages,
} from "@/lib/lineups";
import type { Side } from "@/lib/types";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mapSlug = url.searchParams.get("map") ?? "";
  const agentSlug = url.searchParams.get("agent") ?? "";
  if (!mapSlug || !agentSlug) {
    return NextResponse.json({ lineups: [] });
  }

  // Return both sides in one request; the client filters by side. One fetch
  // per (map, agent) covers all subsequent side toggles.
  const rows = await listLineups({ mapSlug, agentSlug });
  const lineups = await attachSignedUrls(rows);
  return NextResponse.json({ lineups });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const mapSlug = typeof b.map_slug === "string" ? b.map_slug : null;
  const agentSlug = typeof b.agent_slug === "string" ? b.agent_slug : null;
  const side =
    b.side === "attack" || b.side === "defense" ? (b.side as Side) : null;
  if (!mapSlug || !agentSlug || !side) {
    return NextResponse.json(
      { error: "map_slug, agent_slug, side required" },
      { status: 400 },
    );
  }

  const images = normalizeImages(b.images);
  if (images.length === 0) {
    return NextResponse.json(
      { error: "At least one image required" },
      { status: 400 },
    );
  }

  const customFields =
    b.custom_fields && typeof b.custom_fields === "object"
      ? sanitizeCustomFields(b.custom_fields as Record<string, unknown>)
      : {};
  const abilities = normalizeAbilities(b.abilities);

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("lineups")
    .insert({
      map_slug: mapSlug,
      agent_slug: agentSlug,
      side,
      images,
      custom_fields: customFields,
      abilities,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

function sanitizeCustomFields(
  input: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    // `ability` is no longer a custom field — it's the dedicated abilities[]
    // column. Drop any incoming value so stale clients can't repopulate it.
    if (k === "ability") continue;
    if (typeof v === "string" && v.trim() !== "") out[k] = v;
  }
  return out;
}
