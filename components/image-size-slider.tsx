"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

const LS_KEY = "valolineups.image-height";
export const DEFAULT_IMAGE_HEIGHT = 200;
const MIN = 80;
const MAX = 480;
const STEP = 10;

const EVENT = "valolineups:image-height-change";

function parse(raw: string | null): number {
  const n = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(n) || n < MIN || n > MAX) return DEFAULT_IMAGE_HEIGHT;
  return n;
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

function getSnapshot(): number {
  return parse(localStorage.getItem(LS_KEY));
}

function getServerSnapshot(): number {
  return DEFAULT_IMAGE_HEIGHT;
}

export function ImageSizeSlider() {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback((next: number) => {
    try {
      localStorage.setItem(LS_KEY, String(next));
    } catch {
      // ignore quota
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--lineup-image-height",
      `${value}px`,
    );
  }, [value]);

  return (
    <label
      className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-card px-2 text-xs text-muted-foreground"
      title={`Image size: ${value}px`}
    >
      <span aria-hidden="true" className="leading-none">
        Image size
      </span>
      <input
        type="range"
        min={MIN}
        max={MAX}
        step={STEP}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        aria-label="Image size"
        className="h-1 w-24 cursor-pointer accent-primary sm:w-32"
      />
    </label>
  );
}
