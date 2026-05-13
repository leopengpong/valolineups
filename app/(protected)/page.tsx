import { getServerSupabase } from "@/lib/supabase/server";
import { attachSignedUrls, listLineups } from "@/lib/lineups";
import { FilterBar } from "@/components/filter-bar";
import { LineupCard } from "@/components/lineup-card";
import { indexBySlug } from "@/lib/slug";
import type {
  Agent,
  FieldDefinition,
  Lineup,
  Map as MapRow,
  Side,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type SP = Promise<{ map?: string; agent?: string; side?: string }>;

export default async function CheatSheetPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const side: Side = sp.side === "defense" ? "defense" : "attack";

  const supabase = getServerSupabase();
  const [{ data: maps }, { data: agents }, { data: fields }] = await Promise.all([
    supabase.from("maps").select("id, name, sort_order").order("sort_order"),
    supabase.from("agents").select("id, name, sort_order").order("sort_order"),
    supabase
      .from("field_definitions")
      .select("id, key, label, input_type, sort_order")
      .order("sort_order"),
  ]);

  const mapIdx = indexBySlug((maps ?? []) as MapRow[]);
  const agentIdx = indexBySlug((agents ?? []) as Agent[]);
  const mapSlug = sp.map && mapIdx.bySlug.has(sp.map) ? sp.map : undefined;
  const agentSlug =
    sp.agent && agentIdx.bySlug.has(sp.agent) ? sp.agent : undefined;
  const mapId = mapSlug ? mapIdx.bySlug.get(mapSlug)!.id : undefined;
  const agentId = agentSlug ? agentIdx.bySlug.get(agentSlug)!.id : undefined;

  const hasFilters = Boolean(mapId && agentId);
  let lineups: Awaited<ReturnType<typeof attachSignedUrls>> = [];
  if (hasFilters) {
    const rows: Lineup[] = await listLineups({ mapId, agentId, side });
    lineups = await attachSignedUrls(rows);
  }

  return (
    <>
      <FilterBar
        maps={(maps ?? []) as MapRow[]}
        agents={(agents ?? []) as Agent[]}
        current={{ mapSlug, agentSlug, side }}
      />
      <main className="px-4 py-4">
        {!hasFilters ? (
          <EmptyHint />
        ) : lineups.length === 0 ? (
          <NoLineups />
        ) : (
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))",
            }}
          >
            {lineups.map((l) => (
              <LineupCard
                key={l.id}
                lineup={l}
                fields={(fields ?? []) as FieldDefinition[]}
              />
            ))}
          </div>
        )}
      </main>
    </>
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

function NoLineups() {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      No lineups for this filter yet. Click <strong>+ Add</strong> in the top
      right.
    </div>
  );
}
