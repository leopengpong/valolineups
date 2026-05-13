import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { attachSignedUrls, listLineups, normalizeImages } from "@/lib/lineups";
import { getCachedAgents, getCachedMaps } from "@/lib/data/reference";
import { indexBySlug } from "@/lib/slug";
import type { Side } from "@/lib/types";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mapSlug = url.searchParams.get("map") ?? "";
  const agentSlug = url.searchParams.get("agent") ?? "";
  if (!mapSlug || !agentSlug) {
    return NextResponse.json({ lineups: [] });
  }

  const [maps, agents] = await Promise.all([
    getCachedMaps(),
    getCachedAgents(),
  ]);
  const map = indexBySlug(maps).bySlug.get(mapSlug);
  const agent = indexBySlug(agents).bySlug.get(agentSlug);
  if (!map || !agent) return NextResponse.json({ lineups: [] });

  // Return both sides in one request; the client filters by side. One fetch
  // per (map, agent) covers all subsequent side toggles.
  const rows = await listLineups({ mapId: map.id, agentId: agent.id });
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

  const mapId = typeof b.map_id === "string" ? b.map_id : null;
  const agentId = typeof b.agent_id === "string" ? b.agent_id : null;
  const side =
    b.side === "attack" || b.side === "defense" ? (b.side as Side) : null;
  if (!mapId || !agentId || !side) {
    return NextResponse.json(
      { error: "map_id, agent_id, side required" },
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

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("lineups")
    .insert({
      map_id: mapId,
      agent_id: agentId,
      side,
      images,
      custom_fields: customFields,
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
    if (typeof v === "string" && v.trim() !== "") out[k] = v;
  }
  return out;
}
