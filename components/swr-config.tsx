"use client";

import { SWRConfig } from "swr";
import type { Cache, State } from "swr";

const LS_KEY = "valolineups.swr.v1";
// Signed download URLs expire after 60 min — keep a 15 min safety margin.
const PERSIST_TTL_MS = 45 * 60 * 1000;
// Cap on number of persisted entries; LRU eviction past this.
const MAX_ENTRIES = 20;
// Only persist keys whose first element matches one of these.
const PERSIST_PREFIXES = new Set(["lineups"]);

type StoredEntry = { value: State<unknown, unknown>; cachedAt: number };
type StoredShape = Record<string, StoredEntry>;

function isPersistKey(rawKey: string): boolean {
  // SWR's stableHash serializes array keys as `@"lineups","bind","sova",`
  // (leading @, JSON.stringify'd items, trailing comma). Match prefix only.
  for (const prefix of PERSIST_PREFIXES) {
    if (rawKey.startsWith(`@${JSON.stringify(prefix)},`)) return true;
  }
  return false;
}

function readStored(): StoredShape {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredShape;
    const now = Date.now();
    const fresh: StoredShape = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v && typeof v.cachedAt === "number" && now - v.cachedAt < PERSIST_TTL_MS) {
        fresh[k] = v;
      }
    }
    return fresh;
  } catch {
    return {};
  }
}

function writeStored(map: Map<string, State<unknown, unknown>>) {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const entries: Array<[string, StoredEntry]> = [];
    for (const [k, v] of map.entries()) {
      if (!isPersistKey(k)) continue;
      if (!v || v.data === undefined) continue;
      entries.push([k, { value: v, cachedAt: now }]);
    }
    // LRU-ish: keep the last MAX_ENTRIES (insertion order in Map ≈ recency).
    const trimmed = entries.slice(-MAX_ENTRIES);
    const out: StoredShape = Object.fromEntries(trimmed);
    localStorage.setItem(LS_KEY, JSON.stringify(out));
  } catch {
    // ignore quota errors
  }
}

function persistentProvider(): Cache<unknown> {
  const map = new Map<string, State<unknown, unknown>>();
  const stored = readStored();
  for (const [k, entry] of Object.entries(stored)) {
    map.set(k, entry.value);
  }

  let pending: ReturnType<typeof setTimeout> | null = null;
  function schedulePersist() {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      writeStored(map);
    }, 250);
  }

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => writeStored(map));
  }

  return {
    keys: () => map.keys(),
    get: (key: string) => map.get(key),
    set: (key: string, value: State<unknown, unknown>) => {
      map.set(key, value);
      if (isPersistKey(key)) schedulePersist();
    },
    delete: (key: string) => {
      map.delete(key);
      if (isPersistKey(key)) schedulePersist();
    },
  };
}

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        provider: persistentProvider,
        // Don't refetch on focus/reconnect — single-user app, low staleness risk.
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        // Don't refetch when remounting with cached data. Leave revalidateOnMount
        // undefined: SWR's logic is `isUndefined(data) || revalidateIfStale`, so
        // cache misses still fetch but cache hits don't trigger a refetch.
        revalidateIfStale: false,
        dedupingInterval: 60_000,
      }}
    >
      {children}
    </SWRConfig>
  );
}
