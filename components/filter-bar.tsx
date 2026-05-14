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
import { toSlug } from "@/lib/slug";
import { ImageSizeSlider } from "@/components/image-size-slider";
import { LocalZoomToggle } from "@/components/local-zoom-toggle";
import { LineupMatrix } from "@/components/lineup-matrix";
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
  current: { mapSlug?: string; agentSlug?: string; side: Side };
  showAddLink?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const hydrated = useRef(false);
  const [matrixOpen, setMatrixOpen] = useState(false);

  const selectedMap = useMemo(
    () => maps.find((m) => toSlug(m.name) === current.mapSlug),
    [maps, current.mapSlug],
  );
  const selectedAgent = useMemo(
    () => agents.find((a) => toSlug(a.name) === current.agentSlug),
    [agents, current.agentSlug],
  );

  const sideCounts = useMemo(() => {
    if (!selectedMap || !selectedAgent || !lineupCounts) return null;
    return (
      lineupCounts.byMapAgentSide[selectedMap.id]?.[selectedAgent.id] ?? {
        attack: 0,
        defense: 0,
      }
    );
  }, [selectedMap, selectedAgent, lineupCounts]);

  const updateUrl = useMemo(
    () => (next: Stored) => {
      const merged: Stored = {
        map: next.map ?? current.mapSlug,
        agent: next.agent ?? current.agentSlug,
        side: next.side ?? current.side,
      };
      writeStored(merged);
      const sp = new URLSearchParams(params.toString());
      if (merged.map) sp.set("map", merged.map);
      else sp.delete("map");
      if (merged.agent) sp.set("agent", merged.agent);
      else sp.delete("agent");
      if (merged.side) sp.set("side", merged.side);
      else sp.delete("side");
      router.replace(`${pathname}?${sp.toString()}`);
    },
    [current.mapSlug, current.agentSlug, current.side, params, pathname, router],
  );

  // On first mount: if URL is missing filters but localStorage has them, push
  // them into the URL so the server can render.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const stored = readStored();
    const missing =
      (!current.mapSlug && stored.map) ||
      (!current.agentSlug && stored.agent) ||
      (!params.get("side") && stored.side);
    if (missing) updateUrl(stored);
  }, [current.mapSlug, current.agentSlug, params, updateUrl]);

  // `s` toggles side. Ignore when typing in form fields.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "s" && e.key !== "S") return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      e.preventDefault();
      const next: Side = current.side === "attack" ? "defense" : "attack";
      updateUrl({ side: next });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current.side, updateUrl]);

  const triggerLabel =
    selectedMap && selectedAgent
      ? `${selectedMap.name} · ${selectedAgent.name}`
      : "Pick map & agent";

  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <button
        type="button"
        onClick={() => setMatrixOpen(true)}
        className="h-8 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className={cn(!selectedMap && "text-muted-foreground")}>
          {triggerLabel}
        </span>
        <span aria-hidden className="text-muted-foreground">
          ▾
        </span>
      </button>

      <Dialog open={matrixOpen} onOpenChange={setMatrixOpen}>
        <DialogContent className="sm:max-w-3xl">
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
              updateUrl({ map, agent });
            }}
          />
          <p className="text-xs text-muted-foreground">
            Cell counts are{" "}
            <span className="text-red-500/80 dark:text-red-400/80">attack</span>
            {" / "}
            <span className="text-sky-600/80 dark:text-sky-400/80">
              defense
            </span>
            . Faded columns are maps outside the competitive rotation.
          </p>
        </DialogContent>
      </Dialog>

      <div className="ml-1 inline-flex rounded-lg border border-border bg-background overflow-hidden">
        <SideButton
          active={current.side === "attack"}
          onClick={() => updateUrl({ side: "attack" })}
          label="Attack"
          count={sideCounts?.attack}
        />
        <SideButton
          active={current.side === "defense"}
          onClick={() => updateUrl({ side: "defense" })}
          label="Defense"
          count={sideCounts?.defense}
        />
      </div>

      <ImageSizeSlider />
      <LocalZoomToggle />

      <span className="ml-auto flex items-center gap-2">
        {showAddLink && (
          <Link
            href={withFilters("/add", current)}
            className={buttonVariants({ size: "sm" })}
          >
            + Add
          </Link>
        )}
        <Link
          href="/settings"
          className={buttonVariants({ size: "sm", variant: "ghost" })}
        >
          Settings
        </Link>
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
          : "bg-background text-foreground hover:bg-muted",
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
