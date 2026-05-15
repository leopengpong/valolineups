import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import agentsJson from "@/lib/data/agents.json";
import mapsJson from "@/lib/data/maps.json";
import type { Agent, FieldDefinition, Map as MapRow, Side } from "@/lib/types";

export type SideCounts = { attack: number; defense: number };

// Keyed by mapSlug → agentSlug → counts. (Previously keyed by id; consumers
// must read selectedMap.slug / selectedAgent.slug, not .id.)
export type LineupCounts = {
  byMapAgentSide: Record<string, Record<string, SideCounts>>;
};

export async function listMaps(): Promise<MapRow[]> {
  return mapsJson as MapRow[];
}

export async function listAgents(): Promise<Agent[]> {
  return agentsJson as Agent[];
}

export async function listFields(): Promise<FieldDefinition[]> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("field_definitions")
    .select("id, key, label, input_type, sort_order")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as FieldDefinition[];
}

export async function getLineupCounts(): Promise<LineupCounts> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("lineups")
    .select("map_slug, agent_slug, side");
  if (error) throw new Error(error.message);
  const byMapAgentSide: Record<string, Record<string, SideCounts>> = {};
  for (const row of (data ?? []) as Array<{
    map_slug: string;
    agent_slug: string;
    side: Side;
  }>) {
    const inner = (byMapAgentSide[row.map_slug] ??= {});
    const cell = (inner[row.agent_slug] ??= { attack: 0, defense: 0 });
    cell[row.side] += 1;
  }
  return { byMapAgentSide };
}
