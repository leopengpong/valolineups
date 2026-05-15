// Shared row & JSONB types for the lineups DB.

export type Side = "attack" | "defense";

export type LineupImage = {
  path: string; // Supabase Storage object key
  label?: string;
  order: number;
  // Optional custom local-zoom anchor as percentages of the rendered image
  // (0 = top/left, 100 = bottom/right). Missing values default to 50/50
  // (dead center) at read time.
  zoom_x?: number;
  zoom_y?: number;
  // Optional crop rectangle as percentages of the natural image. All four are
  // present together when set; absence means the full image is shown.
  crop_x?: number;
  crop_y?: number;
  crop_w?: number;
  crop_h?: number;
};

export type Map = {
  id: string;
  name: string;
  in_competitive_rotation: boolean;
};

export type Agent = {
  id: string;
  name: string;
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
