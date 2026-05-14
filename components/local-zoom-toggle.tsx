"use client";

import { useCallback, useSyncExternalStore } from "react";

const LS_KEY = "valolineups.all-local-zoom";
const EVENT = "valolineups:all-local-zoom-change";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

function getSnapshot(): boolean {
  return localStorage.getItem(LS_KEY) === "1";
}

function getServerSnapshot(): boolean {
  return false;
}

export function useAllLocalZoom(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function LocalZoomToggle() {
  const value = useAllLocalZoom();

  const setValue = useCallback((next: boolean) => {
    try {
      if (next) localStorage.setItem(LS_KEY, "1");
      else localStorage.removeItem(LS_KEY);
    } catch {
      // ignore quota
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return (
    <label
      className="inline-flex h-8 cursor-pointer select-none items-center gap-2 rounded-lg border border-border bg-background px-2 text-xs text-muted-foreground hover:bg-muted"
      title="Show the local zoom on every image"
    >
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => setValue(e.target.checked)}
        className="h-3 w-3 cursor-pointer accent-primary"
        aria-label="Show local zoom on every image"
      />
      <span className="leading-none">All zoom circles</span>
    </label>
  );
}
