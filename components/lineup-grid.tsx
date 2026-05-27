"use client";

import { useEffect, useMemo, useRef } from "react";
import { Eye } from "lucide-react";
import useSWR from "swr";
import { LineupCard } from "@/components/lineup-card";
import { useSide, useSetSide } from "@/components/side-context";
import { useHiddenLineups, unhideLineups } from "@/components/hidden-lineups";
import type { FieldDefinition, LineupWithUrls } from "@/lib/types";

type LineupsResponse = { lineups: LineupWithUrls[] };

async function fetcher(url: string): Promise<LineupsResponse> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json();
}

export function LineupGrid({
  mapSlug,
  agentSlug,
  fields,
}: {
  mapSlug: string;
  agentSlug: string;
  fields: FieldDefinition[];
}) {
  const side = useSide();
  const setSide = useSetSide();
  const hidden = useHiddenLineups();
  const url = `/api/lineups?map=${encodeURIComponent(mapSlug)}&agent=${encodeURIComponent(agentSlug)}`;
  // Key excludes side: we fetch both sides at once and filter client-side, so
  // toggling sides never triggers a refetch for a known (map, agent).
  const swrKey: [string, string, string] = ["lineups", mapSlug, agentSlug];

  const { data, error, isLoading } = useSWR<LineupsResponse>(
    swrKey,
    () => fetcher(url),
    { keepPreviousData: true },
  );

  // When map/agent changes and the current side has 0 lineups but the other
  // side has some, auto-switch to the populated side.
  const prevDataRef = useRef(data);
  useEffect(() => {
    if (!data || data === prevDataRef.current) return;
    prevDataRef.current = data;

    const attackCount = data.lineups.filter((l) => l.side === "attack").length;
    const defenseCount = data.lineups.filter((l) => l.side === "defense").length;

    if (side === "attack" && attackCount === 0 && defenseCount > 0) {
      setSide("defense");
    } else if (side === "defense" && defenseCount === 0 && attackCount > 0) {
      setSide("attack");
    }
  }, [data, side, setSide]);

  const { visible, hiddenIdsInView } = useMemo(() => {
    const all = (data?.lineups ?? []).filter((l) => l.side === side);
    const visible: LineupWithUrls[] = [];
    const hiddenIdsInView: string[] = [];
    for (const l of all) {
      if (hidden.has(l.id)) hiddenIdsInView.push(l.id);
      else visible.push(l);
    }
    return { visible, hiddenIdsInView };
  }, [data?.lineups, side, hidden]);

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

  const hiddenCount = hiddenIdsInView.length;

  return (
    <div className="flex flex-col gap-3">
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => unhideLineups(hiddenIdsInView)}
          className="inline-flex w-fit items-center gap-1.5 self-start rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Eye className="h-4 w-4" aria-hidden />
          Unhide {hiddenCount} hidden lineup{hiddenCount === 1 ? "" : "s"}
        </button>
      )}
      {visible.length === 0 ? (
        hiddenCount > 0 ? (
          <AllHidden />
        ) : (
          <NoLineups />
        )
      ) : (
        <div className="flex flex-wrap gap-4">
          {visible.map((l) => (
            <LineupCard key={l.id} lineup={l} fields={fields} />
          ))}
        </div>
      )}
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

function AllHidden() {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      Every lineup for this filter is hidden.
    </div>
  );
}
