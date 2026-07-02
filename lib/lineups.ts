import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  ABILITY_KEYS,
  STORAGE_BUCKET,
  type AgentAbilityKey,
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
  mapSlug?: string;
  agentSlug?: string;
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
  if (filter.mapSlug) q = q.eq("map_slug", filter.mapSlug);
  if (filter.agentSlug) q = q.eq("agent_slug", filter.agentSlug);
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
    .slice(0, 5)
    .map((img, i) => {
      const out: LineupImage = {
        path: img.path,
        label: typeof img.label === "string" ? img.label : undefined,
        order: typeof img.order === "number" ? img.order : i,
      };
      const ze = (img as { zoom_enabled?: unknown }).zoom_enabled;
      if (ze === false) {
        out.zoom_enabled = false;
      }
      const zx = (img as { zoom_x?: unknown }).zoom_x;
      const zy = (img as { zoom_y?: unknown }).zoom_y;
      if (typeof zx === "number" && Number.isFinite(zx)) {
        out.zoom_x = clamp01_100(zx);
      }
      if (typeof zy === "number" && Number.isFinite(zy)) {
        out.zoom_y = clamp01_100(zy);
      }
      const cx = (img as { crop_x?: unknown }).crop_x;
      const cy = (img as { crop_y?: unknown }).crop_y;
      const cw = (img as { crop_w?: unknown }).crop_w;
      const ch = (img as { crop_h?: unknown }).crop_h;
      if (
        typeof cx === "number" &&
        typeof cy === "number" &&
        typeof cw === "number" &&
        typeof ch === "number" &&
        Number.isFinite(cx) &&
        Number.isFinite(cy) &&
        Number.isFinite(cw) &&
        Number.isFinite(ch) &&
        cw > 0 &&
        ch > 0
      ) {
        const x = clamp01_100(cx);
        const y = clamp01_100(cy);
        out.crop_x = x;
        out.crop_y = y;
        out.crop_w = clamp01_100(Math.min(cw, 100 - x));
        out.crop_h = clamp01_100(Math.min(ch, 100 - y));
      }
      return out;
    });
}

function clamp01_100(n: number): number {
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

// Strips invalid/legacy keys from custom_fields before persisting.
// `ability` is a legacy key superseded by the dedicated abilities[] column.
export function sanitizeCustomFields(
  input: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (k === "ability") continue;
    if (typeof v === "string" && v.trim() !== "") out[k] = v;
  }
  return out;
}

// Returns the slot keys that are present in `input`, in canonical order, with
// duplicates collapsed and any non-slot strings dropped. The CHECK constraint
// on lineups.abilities depends on this same set.
export function normalizeAbilities(input: unknown): AgentAbilityKey[] {
  if (!Array.isArray(input)) return [];
  const present = new Set<string>();
  for (const v of input) {
    if (typeof v === "string") present.add(v);
  }
  return ABILITY_KEYS.filter((k) => present.has(k));
}
