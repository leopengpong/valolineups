"use client";

import { useSyncExternalStore } from "react";

const LS_KEY = "valolineups.hidden-lineups";
const EVENT = "valolineups:hidden-lineups-change";

// Stable empty reference for SSR and the empty case, so useSyncExternalStore
// doesn't see a new identity each render.
const EMPTY: ReadonlySet<string> = new Set();

let cached: ReadonlySet<string> = EMPTY;
let cachedRaw: string | null = null;

function parse(raw: string | null): ReadonlySet<string> {
  if (!raw) return EMPTY;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return EMPTY;
    const filtered = arr.filter((x): x is string => typeof x === "string");
    return filtered.length === 0 ? EMPTY : new Set(filtered);
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): ReadonlySet<string> {
  const raw = localStorage.getItem(LS_KEY);
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  cached = parse(raw);
  return cached;
}

function getServerSnapshot(): ReadonlySet<string> {
  return EMPTY;
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

function write(next: Set<string>) {
  try {
    if (next.size === 0) localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, JSON.stringify([...next]));
  } catch {
    // ignore quota
  }
  window.dispatchEvent(new Event(EVENT));
}

function readMutable(): Set<string> {
  return new Set(parse(localStorage.getItem(LS_KEY)));
}

export function useHiddenLineups(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function hideLineup(id: string) {
  const cur = readMutable();
  if (cur.has(id)) return;
  cur.add(id);
  write(cur);
}

export function unhideLineup(id: string) {
  const cur = readMutable();
  if (!cur.delete(id)) return;
  write(cur);
}

export function unhideLineups(ids: Iterable<string>) {
  const cur = readMutable();
  let changed = false;
  for (const id of ids) if (cur.delete(id)) changed = true;
  if (changed) write(cur);
}
