import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import type { Agent, FieldDefinition, Map as MapRow } from "@/lib/types";

export const REF_TAGS = {
  maps: "ref:maps",
  agents: "ref:agents",
  fields: "ref:fields",
  lineupCounts: "ref:lineup-counts",
} as const;

export type LineupCounts = {
  byMapId: Record<string, number>;
  byAgentId: Record<string, number>;
  byMapAgent: Record<string, Record<string, number>>;
};

// Next.js 16 requires a profile argument; { expire: 0 } means "purge now and
// mark the path as fully revalidated" (the route-handler analogue of the old
// single-arg call).
export function revalidateRefTag(tag: (typeof REF_TAGS)[keyof typeof REF_TAGS]) {
  revalidateTag(tag, { expire: 0 });
}

export const getCachedMaps = unstable_cache(
  async (): Promise<MapRow[]> => {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from("maps")
      .select("id, name, sort_order, in_competitive_rotation")
      .order("sort_order");
    if (error) throw new Error(error.message);
    return (data ?? []) as MapRow[];
  },
  ["ref:maps"],
  { tags: [REF_TAGS.maps] },
);

export const getCachedAgents = unstable_cache(
  async (): Promise<Agent[]> => {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from("agents")
      .select("id, name, sort_order")
      .order("sort_order");
    if (error) throw new Error(error.message);
    return (data ?? []) as Agent[];
  },
  ["ref:agents"],
  { tags: [REF_TAGS.agents] },
);

export const getCachedFields = unstable_cache(
  async (): Promise<FieldDefinition[]> => {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from("field_definitions")
      .select("id, key, label, input_type, sort_order")
      .order("sort_order");
    if (error) throw new Error(error.message);
    return (data ?? []) as FieldDefinition[];
  },
  ["ref:fields"],
  { tags: [REF_TAGS.fields] },
);

export const getCachedLineupCounts = unstable_cache(
  async (): Promise<LineupCounts> => {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from("lineups")
      .select("map_id, agent_id");
    if (error) throw new Error(error.message);
    const byMapId: Record<string, number> = {};
    const byAgentId: Record<string, number> = {};
    const byMapAgent: Record<string, Record<string, number>> = {};
    for (const row of (data ?? []) as Array<{
      map_id: string;
      agent_id: string;
    }>) {
      byMapId[row.map_id] = (byMapId[row.map_id] ?? 0) + 1;
      byAgentId[row.agent_id] = (byAgentId[row.agent_id] ?? 0) + 1;
      const inner = (byMapAgent[row.map_id] ??= {});
      inner[row.agent_id] = (inner[row.agent_id] ?? 0) + 1;
    }
    return { byMapId, byAgentId, byMapAgent };
  },
  ["ref:lineup-counts"],
  { tags: [REF_TAGS.lineupCounts] },
);
