import {
  getLineupCounts,
  listAgents,
  listFields,
  listMaps,
} from "@/lib/data/reference";
import { FilterBar } from "@/components/filter-bar";
import { LineupGrid } from "@/components/lineup-grid";
import { SideProvider } from "@/components/side-context";

export const dynamic = "force-dynamic";

type SP = Promise<{ map?: string; agent?: string; side?: string }>;

export default async function CheatSheetPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;

  const [maps, agents, fields, lineupCounts] = await Promise.all([
    listMaps(),
    listAgents(),
    listFields(),
    getLineupCounts(),
  ]);

  const mapSlug = sp.map && maps.some((m) => m.slug === sp.map) ? sp.map : undefined;
  const agentSlug =
    sp.agent && agents.some((a) => a.slug === sp.agent) ? sp.agent : undefined;

  const hasFilters = Boolean(mapSlug && agentSlug);

  return (
    <SideProvider>
      <FilterBar
        maps={maps}
        agents={agents}
        lineupCounts={lineupCounts}
        current={{ mapSlug, agentSlug }}
      />
      <main className="px-4 py-4">
        {!hasFilters ? (
          <EmptyHint />
        ) : (
          <LineupGrid
            mapSlug={mapSlug!}
            agentSlug={agentSlug!}
            fields={fields}
          />
        )}
      </main>
    </SideProvider>
  );
}

function EmptyHint() {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      Pick a map and agent above.{" "}
      <kbd className="rounded border border-border px-1.5 py-0.5 text-xs">
        s
      </kbd>{" "}
      toggles side.
    </div>
  );
}
