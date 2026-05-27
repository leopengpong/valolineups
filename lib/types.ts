// Shared row & JSONB types for the lineups DB.

export type Side = "attack" | "defense";

export type LineupImage = {
  path: string; // Supabase Storage object key
  label?: string;
  order: number;
  // When false, no zoom circle or crosshair appears for this image.
  // Absent means true (backwards compat with pre-existing data).
  zoom_enabled?: boolean;
  zoom_x?: number;
  zoom_y?: number;
  // Optional crop rectangle as percentages of the natural image. All four are
  // present together when set; absence means the full image is shown.
  crop_x?: number;
  crop_y?: number;
  crop_w?: number;
  crop_h?: number;
};

// Maps and agents are static reference data: source of truth lives in
// lib/data/{maps,agents}.json, refreshed from valorant-api.com by
// asset_updater/sync-reference.mjs at build time. The slug — derived once
// from the display name (lowercase, "/" dropped, non-alphanumerics → "-")
// — is the stable identity, used in URLs and as the foreign-key-equivalent
// on lineups.

export type Map = {
  slug: string;
  name: string;
  in_competitive_rotation: boolean;
};

export type AgentAbility = {
  name: string;
  icon: string; // public-relative path, e.g. "/agent-abilities/sova-ability1.png"
};

export type AgentAbilityKey = "ability1" | "ability2" | "ability3" | "ultimate";

// Canonical render/storage order for ability slots. Keep in sync with the
// CHECK constraint on lineups.abilities and the SLOT_TO_KEY map in
// asset_updater/sync-reference.mjs.
export const ABILITY_KEYS: readonly AgentAbilityKey[] = [
  "ability1",
  "ability2",
  "ability3",
  "ultimate",
] as const;

export type Agent = {
  slug: string;
  name: string;
  // The API's "Grenade" slot is exposed as ability3. "Passive" is not synced.
  // Partial in case a brand-new agent ships with incomplete API data.
  abilities: Partial<Record<AgentAbilityKey, AgentAbility>>;
};

export type FieldInputType = "text" | "textarea";

export type FieldDefinition = {
  id: string;
  key: string;
  label: string;
  input_type: FieldInputType;
  sort_order: number;
};

export type Lineup = {
  id: string;
  map_slug: string;
  agent_slug: string;
  side: Side;
  images: LineupImage[];
  custom_fields: Record<string, string>;
  // Subset of ABILITY_KEYS, persisted server-side in canonical order.
  abilities: AgentAbilityKey[];
  created_at: string;
  updated_at: string;
};

// Lineup augmented with signed image URLs for client rendering.
export type LineupWithUrls = Omit<Lineup, "images"> & {
  images: Array<LineupImage & { url: string }>;
};

export const STORAGE_BUCKET = "lineups";
