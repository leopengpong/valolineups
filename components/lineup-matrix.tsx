"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { toSlug } from "@/lib/slug";
import type { LineupCounts, SideCounts } from "@/lib/data/reference";
import type { Agent, Map as MapRow } from "@/lib/types";

const EMPTY: SideCounts = { attack: 0, defense: 0 };

export function LineupMatrix({
  maps,
  agents,
  lineupCounts,
  current,
  onSelect,
}: {
  maps: MapRow[];
  agents: Agent[];
  lineupCounts?: LineupCounts;
  current: { mapSlug?: string; agentSlug?: string };
  onSelect: (mapSlug: string, agentSlug: string) => void;
}) {
  const { rotationMaps, otherMaps } = useMemo(() => {
    const r: MapRow[] = [];
    const o: MapRow[] = [];
    for (const m of maps) (m.in_competitive_rotation ? r : o).push(m);
    return { rotationMaps: r, otherMaps: o };
  }, [maps]);

  function renderMapHeader(m: MapRow, muted: boolean) {
    return (
      <th
        key={m.id}
        scope="col"
        className={cn(
          "sticky top-0 z-10 bg-popover px-2 py-2 text-center font-medium border-b border-border whitespace-nowrap",
          muted && "text-muted-foreground/60 italic font-normal",
        )}
      >
        {m.name}
      </th>
    );
  }

  return (
    <div className="overflow-auto rounded-lg border border-border max-h-[70vh]">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky top-0 left-0 z-20 bg-popover px-2 py-2 text-left font-medium border-b border-r border-border whitespace-nowrap"
            >
              Agent
            </th>
            {rotationMaps.map((m) => renderMapHeader(m, false))}
            {otherMaps.length > 0 && (
              <th
                aria-hidden
                className="sticky top-0 z-10 bg-popover border-b border-l border-border w-2"
              />
            )}
            {otherMaps.map((m) => renderMapHeader(m, true))}
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => {
            const agentSlug = toSlug(a.name);
            return (
              <tr key={a.id} className="border-b border-border last:border-b-0">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-popover px-2 py-1.5 text-left font-medium border-r border-border whitespace-nowrap"
                >
                  {a.name}
                </th>
                {rotationMaps.map((m) => (
                  <MatrixCell
                    key={m.id}
                    counts={lineupCounts?.byMapAgentSide[m.id]?.[a.id] ?? EMPTY}
                    selected={
                      current.mapSlug === toSlug(m.name) &&
                      current.agentSlug === agentSlug
                    }
                    muted={false}
                    onClick={() => onSelect(toSlug(m.name), agentSlug)}
                  />
                ))}
                {otherMaps.length > 0 && (
                  <td aria-hidden className="border-l border-border w-2" />
                )}
                {otherMaps.map((m) => (
                  <MatrixCell
                    key={m.id}
                    counts={lineupCounts?.byMapAgentSide[m.id]?.[a.id] ?? EMPTY}
                    selected={
                      current.mapSlug === toSlug(m.name) &&
                      current.agentSlug === agentSlug
                    }
                    muted={true}
                    onClick={() => onSelect(toSlug(m.name), agentSlug)}
                  />
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MatrixCell({
  counts,
  selected,
  muted,
  onClick,
}: {
  counts: SideCounts;
  selected: boolean;
  muted: boolean;
  onClick: () => void;
}) {
  const both = counts.attack === 0 && counts.defense === 0;
  return (
    <td className="p-0">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={cn(
          "block w-full h-full px-2 py-1.5 text-center tabular-nums transition-colors min-w-[3.5rem]",
          selected
            ? "bg-primary/15 ring-1 ring-inset ring-primary"
            : "hover:bg-muted",
          muted && !selected && "opacity-60",
        )}
      >
        {both ? (
          <span className="text-muted-foreground/30">–</span>
        ) : (
          <span>
            <span
              className={cn(
                "text-red-500/80 dark:text-red-400/80",
                counts.attack === 0 && "text-muted-foreground/30",
              )}
            >
              {counts.attack === 0 ? "–" : counts.attack}
            </span>
            <span className="text-muted-foreground/40 px-0.5">/</span>
            <span
              className={cn(
                "text-sky-600/80 dark:text-sky-400/80",
                counts.defense === 0 && "text-muted-foreground/30",
              )}
            >
              {counts.defense === 0 ? "–" : counts.defense}
            </span>
          </span>
        )}
      </button>
    </td>
  );
}
