"use client";

import useSWR from "swr";
import { LineupCard } from "@/components/lineup-card";
import type { FieldDefinition, LineupWithUrls, Side } from "@/lib/types";

type LineupsResponse = { lineups: LineupWithUrls[] };

async function fetcher(url: string): Promise<LineupsResponse> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json();
}

export function LineupGrid({
  mapSlug,
  agentSlug,
  side,
  fields,
}: {
  mapSlug: string;
  agentSlug: string;
  side: Side;
  fields: FieldDefinition[];
}) {
  const url = `/api/lineups?map=${encodeURIComponent(mapSlug)}&agent=${encodeURIComponent(agentSlug)}`;
  // Key excludes side: we fetch both sides at once and filter client-side, so
  // toggling sides never triggers a refetch for a known (map, agent).
  const swrKey: [string, string, string] = ["lineups", mapSlug, agentSlug];

  const { data, error, isLoading } = useSWR<LineupsResponse>(
    swrKey,
    () => fetcher(url),
    { keepPreviousData: true },
  );

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        Failed to load lineups.
      </div>
    );
  }

  if (!data && isLoading) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Loading lineups…
      </div>
    );
  }

  const lineups = (data?.lineups ?? []).filter((l) => l.side === side);
  if (lineups.length === 0) {
    return <NoLineups />;
  }

  return (
    <div className="flex flex-wrap gap-4">
      {lineups.map((l) => (
        <LineupCard key={l.id} lineup={l} fields={fields} />
      ))}
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
