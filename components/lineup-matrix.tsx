"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { toSlug } from "@/lib/slug";
import type { LineupCounts, SideCounts } from "@/lib/data/reference";
import type { Agent, Map as MapRow } from "@/lib/types";

const EMPTY: SideCounts = { attack: 0, defense: 0 };
const SHOW_OUT_OF_ROTATION_LS_KEY = "valolineups.matrix.show-out-of-rotation";
const SHOW_EMPTY_AGENTS_LS_KEY = "valolineups.matrix.show-empty-agents";

function readBoolFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeBoolFlag(key: string, value: boolean) {
  try {
    if (value) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    // ignore quota
  }
}

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

  // Both default false. The matrix only mounts after the user opens the
  // dialog, so reading localStorage in the initializer is safe (no SSR
  // pre-render to mismatch).
  const [showOutOfRotation, setShowOutOfRotation] = useState(() =>
    readBoolFlag(SHOW_OUT_OF_ROTATION_LS_KEY),
  );
  const [showEmptyAgents, setShowEmptyAgents] = useState(() =>
    readBoolFlag(SHOW_EMPTY_AGENTS_LS_KEY),
  );

  function toggleOutOfRotation(next: boolean) {
    setShowOutOfRotation(next);
    writeBoolFlag(SHOW_OUT_OF_ROTATION_LS_KEY, next);
  }

  function toggleEmptyAgents(next: boolean) {
    setShowEmptyAgents(next);
    writeBoolFlag(SHOW_EMPTY_AGENTS_LS_KEY, next);
  }

  const visibleOtherMaps = showOutOfRotation ? otherMaps : [];

  // "Has at least one lineup" is computed across ALL maps regardless of the
  // rotation toggle — toggling rotation shouldn't shuffle the agent list.
  const agentsWithLineups = useMemo(() => {
    if (!lineupCounts) return null;
    const ids = new Set<string>();
    for (const mapId of Object.keys(lineupCounts.byMapAgentSide)) {
      const inner = lineupCounts.byMapAgentSide[mapId];
      for (const agentId of Object.keys(inner)) {
        const c = inner[agentId];
        if (c.attack > 0 || c.defense > 0) ids.add(agentId);
      }
    }
    return ids;
  }, [lineupCounts]);

  const visibleAgents =
    showEmptyAgents || !agentsWithLineups
      ? agents
      : agents.filter((a) => agentsWithLineups.has(a.id));

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
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {otherMaps.length > 0 && (
          <label className="inline-flex cursor-pointer select-none items-center gap-2">
            <input
              type="checkbox"
              checked={showOutOfRotation}
              onChange={(e) => toggleOutOfRotation(e.target.checked)}
              className="h-3 w-3 cursor-pointer accent-primary"
            />
            <span>Show out-of-rotation maps</span>
          </label>
        )}
        <label className="inline-flex cursor-pointer select-none items-center gap-2">
          <input
            type="checkbox"
            checked={showEmptyAgents}
            onChange={(e) => toggleEmptyAgents(e.target.checked)}
            className="h-3 w-3 cursor-pointer accent-primary"
          />
          <span>Show agents without lineups</span>
        </label>
      </div>
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
              {visibleOtherMaps.length > 0 && (
                <th
                  aria-hidden
                  className="sticky top-0 z-10 bg-popover border-b border-l border-border w-2"
                />
              )}
              {visibleOtherMaps.map((m) => renderMapHeader(m, true))}
            </tr>
          </thead>
          <tbody>
            {visibleAgents.map((a) => {
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
                  {visibleOtherMaps.length > 0 && (
                    <td aria-hidden className="border-l border-border w-2" />
                  )}
                  {visibleOtherMaps.map((m) => (
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
