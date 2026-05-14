import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import type { Agent, FieldDefinition, Map as MapRow, Side } from "@/lib/types";

export type SideCounts = { attack: number; defense: number };

export type LineupCounts = {
  byMapAgentSide: Record<string, Record<string, SideCounts>>;
};

export async function listMaps(): Promise<MapRow[]> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("maps")
    .select("id, name, in_competitive_rotation")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as MapRow[];
}

export async function listAgents(): Promise<Agent[]> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("agents")
    .select("id, name")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Agent[];
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
    .select("map_id, agent_id, side");
  if (error) throw new Error(error.message);
  const byMapAgentSide: Record<string, Record<string, SideCounts>> = {};
  for (const row of (data ?? []) as Array<{
    map_id: string;
    agent_id: string;
    side: Side;
  }>) {
    const inner = (byMapAgentSide[row.map_id] ??= {});
    const cell = (inner[row.agent_id] ??= { attack: 0, defense: 0 });
    cell[row.side] += 1;
  }
  return { byMapAgentSide };
}
