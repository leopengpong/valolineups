import { notFound } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { attachSignedUrls } from "@/lib/lineups";
import { listAgents, listFields, listMaps } from "@/lib/data/reference";
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
  const derivedImageText = deriveImageTextFromNotes(
    withUrls.images.length,
    withUrls.custom_fields?.notes,
  );
  const customFields = { ...(withUrls.custom_fields ?? {}) };
  if (derivedImageText.some(Boolean)) delete customFields.notes;

  const initial = {
    id: withUrls.id,
    mapSlug: withUrls.map_slug,
    agentSlug: withUrls.agent_slug,
    side: withUrls.side,
    images: withUrls.images.map((img, index) => ({
      id: img.path,
      existingPath: img.path,
      previewUrl: img.url,
      label: img.label,
      text: img.text ?? derivedImageText[index],
      zoomEnabled: img.zoom_enabled ?? true,
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
    customFields,
    abilities: withUrls.abilities ?? [],
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      <LineupForm
        maps={maps}
        agents={agents}
        fields={fields}
        initial={initial}
      />
    </main>
  );
}

function deriveImageTextFromNotes(imageCount: number, notes?: string): string[] {
  if (imageCount === 0) return [];
  const steps = parseNoteSteps(notes);
  return Array.from({ length: imageCount }, (_unused, imageIndex) => {
    const assigned = steps.filter((_step, stepIndex) => {
      if (stepIndex < imageCount - 1) return stepIndex === imageIndex;
      return imageIndex === imageCount - 1;
    });
    return assigned
      .map((step, offset) => {
        const number =
          imageIndex < imageCount - 1 ? imageIndex + 1 : imageCount + offset;
        return `${number}. ${step}`;
      })
      .join("\n");
  });
}

function parseNoteSteps(notes?: string): string[] {
  if (!notes) return [];
  let text = notes.trim();
  const routeMatch = text.match(/^From\s+([\s\S]+?)\s+to\s+([\s\S]+?)\.\s*/i);
  if (routeMatch) text = text.slice(routeMatch[0].length).trim();
  text = text
    .split(/\n+/)
    .filter((line) => !/^source\s*:/i.test(line.trim()))
    .join("\n")
    .trim();
  if (!text) return [];
  return text
    .replace(/\s+(\d+\.\s+)/g, "\n$1")
    .split(/\n+/)
    .map((line) => line.trim().replace(/^\d+[.)]\s*/, ""))
    .filter(Boolean);
}
