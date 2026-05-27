import { LineupForm } from "@/components/lineup-form";
import { listAgents, listFields, listMaps } from "@/lib/data/reference";
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

  const knownMap = sp.map && maps.some((m) => m.slug === sp.map) ? sp.map : undefined;
  const knownAgent =
    sp.agent && agents.some((a) => a.slug === sp.agent) ? sp.agent : undefined;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      <LineupForm
        maps={maps}
        agents={agents}
        fields={fields}
        prefilledFilters={{ map: knownMap, agent: knownAgent, side }}
      />
    </main>
  );
}
