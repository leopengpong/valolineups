import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  STORAGE_BUCKET,
  type Lineup,
  type LineupWithUrls,
  type LineupImage,
  type Side,
} from "@/lib/types";

const SIGNED_URL_TTL = 60 * 60; // 1 hour

export async function attachSignedUrls(
  lineups: Lineup[],
): Promise<LineupWithUrls[]> {
  const paths = Array.from(
    new Set(lineups.flatMap((l) => l.images.map((i) => i.path))),
  );
  if (paths.length === 0) {
    return lineups.map((l) => ({ ...l, images: [] }));
  }
  const supabase = getServerSupabase();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL);
  if (error || !data) {
    throw new Error(error?.message || "Failed to sign image URLs");
  }
  const urlByPath = new Map(data.map((d) => [d.path ?? "", d.signedUrl]));
  return lineups.map((l) => ({
    ...l,
    images: l.images
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((img) => ({ ...img, url: urlByPath.get(img.path) ?? "" })),
  }));
}

export type LineupFilter = {
  mapId?: string;
  agentId?: string;
  side?: Side;
};

export async function listLineups(
  filter: LineupFilter = {},
): Promise<Lineup[]> {
  const supabase = getServerSupabase();
  let q = supabase
    .from("lineups")
    .select("*")
    .order("created_at", { ascending: false });
  if (filter.mapId) q = q.eq("map_id", filter.mapId);
  if (filter.agentId) q = q.eq("agent_id", filter.agentId);
  if (filter.side) q = q.eq("side", filter.side);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Lineup[];
}

// Strip orphan Storage objects that are no longer referenced by any lineup.
// Called on update/delete to keep storage tidy.
export async function deleteStorageObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const supabase = getServerSupabase();
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
  if (error) throw new Error(error.message);
}

export function normalizeImages(images: unknown): LineupImage[] {
  if (!Array.isArray(images)) return [];
  return images
    .filter(
      (img): img is LineupImage =>
        typeof img === "object" &&
        img !== null &&
        typeof (img as { path?: unknown }).path === "string",
    )
    .slice(0, 3)
    .map((img, i) => ({
      path: img.path,
      label: typeof img.label === "string" ? img.label : undefined,
      order: typeof img.order === "number" ? img.order : i,
    }));
}
