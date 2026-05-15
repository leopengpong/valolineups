import { notFound } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { attachSignedUrls } from "@/lib/lineups";
import { listAgents, listFields, listMaps } from "@/lib/data/reference";
import { BackButton } from "@/components/back-button";
import { LineupForm } from "@/components/lineup-form";
import type { Lineup } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function EditLineupPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = getServerSupabase();

  const [{ data: row, error }, maps, agents, fields] = await Promise.all([
    supabase.from("lineups").select("*").eq("id", id).single(),
    listMaps(),
    listAgents(),
    listFields(),
  ]);

  if (error || !row) notFound();

  const [withUrls] = await attachSignedUrls([row as Lineup]);

  const initial = {
    id: withUrls.id,
    mapSlug: withUrls.map_slug,
    agentSlug: withUrls.agent_slug,
    side: withUrls.side,
    images: withUrls.images.map((img) => ({
      existingPath: img.path,
      previewUrl: img.url,
      label: img.label,
      customZoom: img.zoom_x !== undefined || img.zoom_y !== undefined,
      zoomX: img.zoom_x,
      zoomY: img.zoom_y,
      customCrop:
        img.crop_x !== undefined &&
        img.crop_y !== undefined &&
        img.crop_w !== undefined &&
        img.crop_h !== undefined,
      cropX: img.crop_x,
      cropY: img.crop_y,
      cropW: img.crop_w,
      cropH: img.crop_h,
    })),
    customFields: withUrls.custom_fields ?? {},
    abilities: withUrls.abilities ?? [],
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">Edit lineup</h1>
        <BackButton className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </BackButton>
      </div>
      <LineupForm
        maps={maps}
        agents={agents}
        fields={fields}
        initial={initial}
      />
    </main>
  );
}
