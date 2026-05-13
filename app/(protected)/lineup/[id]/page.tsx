import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { attachSignedUrls } from "@/lib/lineups";
import { LineupForm } from "@/components/lineup-form";
import type {
  Agent,
  FieldDefinition,
  Lineup,
  Map as MapRow,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function EditLineupPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = getServerSupabase();

  const [{ data: row, error }, { data: maps }, { data: agents }, { data: fields }] =
    await Promise.all([
      supabase.from("lineups").select("*").eq("id", id).single(),
      supabase.from("maps").select("id, name, sort_order").order("sort_order"),
      supabase.from("agents").select("id, name, sort_order").order("sort_order"),
      supabase
        .from("field_definitions")
        .select("id, key, label, input_type, sort_order")
        .order("sort_order"),
    ]);

  if (error || !row) notFound();

  const [withUrls] = await attachSignedUrls([row as Lineup]);

  const initial = {
    id: withUrls.id,
    mapId: withUrls.map_id,
    agentId: withUrls.agent_id,
    side: withUrls.side,
    images: withUrls.images.map((img) => ({
      existingPath: img.path,
      previewUrl: img.url,
      label: img.label,
    })),
    customFields: withUrls.custom_fields ?? {},
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">Edit lineup</h1>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Cheat sheet
        </Link>
      </div>
      <LineupForm
        maps={(maps ?? []) as MapRow[]}
        agents={(agents ?? []) as Agent[]}
        fields={(fields ?? []) as FieldDefinition[]}
        initial={initial}
      />
    </main>
  );
}
