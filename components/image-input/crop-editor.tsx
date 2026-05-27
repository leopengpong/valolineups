"use client";

const CORNER_CURSOR: Record<"nw" | "ne" | "sw" | "se", string> = {
  nw: "cursor-nwse-resize",
  ne: "cursor-nesw-resize",
  sw: "cursor-nesw-resize",
  se: "cursor-nwse-resize",
};

export function CropCorner({
  corner,
  x,
  y,
}: {
  corner: "nw" | "ne" | "sw" | "se";
  x: number;
  y: number;
}) {
  return (
    <div
      data-crop-corner={corner}
      className={
        "absolute h-4 w-4 rounded-sm border-2 border-white bg-black/50 touch-none " +
        CORNER_CURSOR[corner]
      }
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%, -50%)",
      }}
    />
  );
}

export function isOverCrosshair(
  clientX: number,
  clientY: number,
  wrapperEl: HTMLElement,
  zoomXPct: number,
  zoomYPct: number,
): boolean {
  const rect = wrapperEl.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const cx = (zoomXPct / 100) * rect.width;
  const cy = (zoomYPct / 100) * rect.height;
  const dx = clientX - rect.left - cx;
  const dy = clientY - rect.top - cy;
  const CROSSHAIR_HIT_RADIUS = 39;
  return dx * dx + dy * dy <= CROSSHAIR_HIT_RADIUS * CROSSHAIR_HIT_RADIUS;
}

export function clamp(n: number, min = 0, max = 100): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
