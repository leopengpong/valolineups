"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Agent, Map, Side } from "@/lib/types";

const LS_KEY = "valolineups.filters.v1";

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
  current,
  showAddLink = true,
}: {
  maps: Map[];
  agents: Agent[];
  current: { mapId?: string; agentId?: string; side: Side };
  showAddLink?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const hydrated = useRef(false);

  const updateUrl = useMemo(
    () => (next: Stored) => {
      const merged: Stored = {
        map: next.map ?? current.mapId,
        agent: next.agent ?? current.agentId,
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
    [current.mapId, current.agentId, current.side, params, pathname, router],
  );

  // On first mount: if URL is missing filters but localStorage has them, push
  // them into the URL so the server can render.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const stored = readStored();
    const missing =
      (!current.mapId && stored.map) ||
      (!current.agentId && stored.agent) ||
      (!params.get("side") && stored.side);
    if (missing) updateUrl(stored);
  }, [current.mapId, current.agentId, params, updateUrl]);

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

  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <NativeSelect
        value={current.mapId ?? ""}
        onChange={(v) => updateUrl({ map: v || undefined })}
        placeholder="Map"
        options={maps.map((m) => ({ value: m.id, label: m.name }))}
      />
      <NativeSelect
        value={current.agentId ?? ""}
        onChange={(v) => updateUrl({ agent: v || undefined })}
        placeholder="Agent"
        options={agents.map((a) => ({ value: a.id, label: a.name }))}
      />

      <div className="ml-1 inline-flex rounded-lg border border-border bg-background overflow-hidden">
        <SideButton
          active={current.side === "attack"}
          onClick={() => updateUrl({ side: "attack" })}
          label="Attack"
        />
        <SideButton
          active={current.side === "defense"}
          onClick={() => updateUrl({ side: "defense" })}
          label="Defense"
        />
      </div>

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

function NativeSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-36 sm:w-44 rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function SideButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "px-3 h-8 text-sm transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-background text-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

function withFilters(
  path: string,
  f: { mapId?: string; agentId?: string; side: Side },
) {
  const sp = new URLSearchParams();
  if (f.mapId) sp.set("map", f.mapId);
  if (f.agentId) sp.set("agent", f.agentId);
  sp.set("side", f.side);
  return `${path}?${sp.toString()}`;
}
