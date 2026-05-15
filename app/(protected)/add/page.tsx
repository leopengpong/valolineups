import { BackButton } from "@/components/back-button";
import { LineupForm } from "@/components/lineup-form";
import { listAgents, listFields, listMaps } from "@/lib/data/reference";
import { indexBySlug } from "@/lib/slug";
import type { Side } from "@/lib/types";

export const dynamic = "force-dynamic";

type SP = Promise<{ map?: string; agent?: string; side?: string }>;

export default async function AddPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const side: Side | undefined =
    sp.side === "defense" || sp.side === "attack" ? sp.side : undefined;

  const [maps, agents, fields] = await Promise.all([
    listMaps(),
    listAgents(),
    listFields(),
  ]);

  const mapIdx = indexBySlug(maps);
  const agentIdx = indexBySlug(agents);
  const prefilledMapId = sp.map ? mapIdx.bySlug.get(sp.map)?.id : undefined;
  const prefilledAgentId = sp.agent
    ? agentIdx.bySlug.get(sp.agent)?.id
    : undefined;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">Add lineup</h1>
        <BackButton className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </BackButton>
      </div>
      <LineupForm
        maps={maps}
        agents={agents}
        fields={fields}
        prefilledFilters={{ map: prefilledMapId, agent: prefilledAgentId, side }}
      />
    </main>
  );
}
