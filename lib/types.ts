// Shared row & JSONB types for the lineups DB.

export type Side = "attack" | "defense";

export type LineupImage = {
  path: string; // Supabase Storage object key
  label?: string;
  order: number;
};

export type Map = {
  id: string;
  name: string;
  sort_order: number;
  in_competitive_rotation: boolean;
};

export type Agent = {
  id: string;
  name: string;
  sort_order: number;
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
  map_id: string;
  agent_id: string;
  side: Side;
  images: LineupImage[];
  custom_fields: Record<string, string>;
  created_at: string;
  updated_at: string;
};

// Lineup augmented with signed image URLs for client rendering.
export type LineupWithUrls = Omit<Lineup, "images"> & {
  images: Array<LineupImage & { url: string }>;
};

export const STORAGE_BUCKET = "lineups";
