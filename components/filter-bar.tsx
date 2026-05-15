"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ImageSizeSlider } from "@/components/image-size-slider";
import { LocalZoomToggle } from "@/components/local-zoom-toggle";
import { LineupMatrix } from "@/components/lineup-matrix";
import { useSetSide, useSide } from "@/components/side-context";
import type { LineupCounts } from "@/lib/data/reference";
import type { Agent, Map, Side } from "@/lib/types";

// Bumped from v1 (UUIDs) to v2 (slugs); old values are ignored.
const LS_KEY = "valolineups.filters.v2";

type Stored = { map?: string; agent?: string; side?: Side };

function readStored(): Stored {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeStored(s: Stored) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    // ignore quota
  }
}

export function FilterBar({
  maps,
  agents,
  lineupCounts,
  current,
  showAddLink = true,
}: {
  maps: Map[];
  agents: Agent[];
  lineupCounts?: LineupCounts;
  current: { mapSlug?: string; agentSlug?: string };
  showAddLink?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const hydrated = useRef(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const side = useSide();
  const setSide = useSetSide();

  const selectedMap = useMemo(
    () => maps.find((m) => m.slug === current.mapSlug),
    [maps, current.mapSlug],
  );
  const selectedAgent = useMemo(
    () => agents.find((a) => a.slug === current.agentSlug),
    [agents, current.agentSlug],
  );

  const sideCounts = useMemo(() => {
    if (!selectedMap || !selectedAgent || !lineupCounts) return null;
    return (
      lineupCounts.byMapAgentSide[selectedMap.slug]?.[selectedAgent.slug] ?? {
        attack: 0,
        defense: 0,
      }
    );
  }, [selectedMap, selectedAgent, lineupCounts]);

  // Map/agent changes go through router.replace because they drive the
  // SWR fetch key and the hasFilters branch on the server page.
  const updateMapAgent = useMemo(
    () => (next: { map?: string; agent?: string }) => {
      const mergedMap = next.map ?? current.mapSlug;
      const mergedAgent = next.agent ?? current.agentSlug;
      writeStored({ map: mergedMap, agent: mergedAgent, side });
      const sp = new URLSearchParams(params.toString());
      if (mergedMap) sp.set("map", mergedMap);
      else sp.delete("map");
      if (mergedAgent) sp.set("agent", mergedAgent);
      else sp.delete("agent");
      sp.set("side", side);
      router.replace(`${pathname}?${sp.toString()}`);
    },
    [current.mapSlug, current.agentSlug, side, params, pathname, router],
  );

  // Side is a client-only memory filter — setSide updates context and the
  // URL via history.replaceState, never triggering an RSC roundtrip.
  const updateSide = useMemo(
    () => (next: Side) => {
      setSide(next);
      writeStored({
        map: current.mapSlug,
        agent: current.agentSlug,
        side: next,
      });
    },
    [setSide, current.mapSlug, current.agentSlug],
  );

  // On first mount: if URL is missing filters but localStorage has them, push
  // them in. Map/agent needs router.replace; side uses setSide.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const stored = readStored();
    const urlSide = params.get("side");
    const needsMapAgent =
      (!current.mapSlug && stored.map) || (!current.agentSlug && stored.agent);
    if (needsMapAgent) {
      const sp = new URLSearchParams(params.toString());
      if (!current.mapSlug && stored.map) sp.set("map", stored.map);
      if (!current.agentSlug && stored.agent) sp.set("agent", stored.agent);
      if (!urlSide && stored.side) sp.set("side", stored.side);
      else sp.set("side", side);
      router.replace(`${pathname}?${sp.toString()}`);
    }
    if (!urlSide && stored.side && stored.side !== side) {
      setSide(stored.side);
    }
  }, [
    current.mapSlug,
    current.agentSlug,
    params,
    pathname,
    router,
    setSide,
    side,
  ]);

  // `s` toggles side. Ignore when typing in form fields.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "s" && e.key !== "S") return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      e.preventDefault();
      updateSide(side === "attack" ? "defense" : "attack");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [side, updateSide]);

  const triggerLabel =
    selectedMap && selectedAgent
      ? `${selectedMap.name} · ${selectedAgent.name}`
      : "Pick map & agent";

  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <button
        type="button"
        onClick={() => setMatrixOpen(true)}
        className="h-8 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className={cn(!selectedMap && "text-muted-foreground")}>
          {triggerLabel}
        </span>
        <span aria-hidden className="text-muted-foreground">
          ▾
        </span>
      </button>

      <Dialog open={matrixOpen} onOpenChange={setMatrixOpen}>
        <DialogContent className="w-fit sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Pick map & agent</DialogTitle>
          </DialogHeader>
          <LineupMatrix
            maps={maps}
            agents={agents}
            lineupCounts={lineupCounts}
            current={{
              mapSlug: current.mapSlug,
              agentSlug: current.agentSlug,
            }}
            onSelect={(map, agent) => {
              setMatrixOpen(false);
              updateMapAgent({ map, agent });
            }}
          />
          <p className="text-xs text-muted-foreground">
            Cell counts are{" "}
            <span className="text-red-500/80 dark:text-red-400/80">attack</span>
            {" / "}
            <span className="text-sky-600/80 dark:text-sky-400/80">
              defense
            </span>
            .
          </p>
        </DialogContent>
      </Dialog>

      <div className="ml-1 inline-flex rounded-lg border border-border bg-card overflow-hidden">
        <SideButton
          active={side === "attack"}
          onClick={() => updateSide("attack")}
          label="Attack"
          count={sideCounts?.attack}
        />
        <SideButton
          active={side === "defense"}
          onClick={() => updateSide("defense")}
          label="Defense"
          count={sideCounts?.defense}
        />
      </div>

      <ImageSizeSlider />
      <LocalZoomToggle />

      <span className="ml-auto flex items-center gap-2">
        {showAddLink && (
          <Link
            href={withFilters("/add", { ...current, side })}
            className={buttonVariants({ size: "sm" })}
          >
            + Add
          </Link>
        )}
      </span>
    </div>
  );
}

function SideButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "px-3 h-8 text-sm transition-colors tabular-nums",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-card text-foreground hover:bg-muted",
      )}
    >
      {label}
      {typeof count === "number" && (
        <span
          className={cn(
            "ml-1.5",
            active ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function withFilters(
  path: string,
  f: { mapSlug?: string; agentSlug?: string; side: Side },
) {
  const sp = new URLSearchParams();
  if (f.mapSlug) sp.set("map", f.mapSlug);
  if (f.agentSlug) sp.set("agent", f.agentSlug);
  sp.set("side", f.side);
  return `${path}?${sp.toString()}`;
}
