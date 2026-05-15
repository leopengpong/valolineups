"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { blobToImageFile } from "@/lib/image";

export type ImageItem = {
  // For newly-added images.
  file?: File;
  previewUrl: string; // object URL for new files, signed URL for existing.
  // For existing images already in Storage.
  existingPath?: string;
  label?: string;
  // Per-image local-zoom anchor. When `customZoom` is true the image saves
  // its zoom_x/zoom_y; when false it falls back to dead-center (50/50) at
  // render time. When `customCrop` is also true, the zoom point is kept
  // inside the crop rectangle.
  customZoom?: boolean;
  zoomX?: number; // 0-100
  zoomY?: number; // 0-100
  // Per-image crop rectangle. When `customCrop` is true the image saves
  // its crop_x/y/w/h; when false the full image is shown on the cheat sheet.
  customCrop?: boolean;
  cropX?: number; // 0-100, left edge
  cropY?: number; // 0-100, top edge
  cropW?: number; // 0-100, width
  cropH?: number; // 0-100, height
};

const MAX_IMAGES = 3;

// Min crop dimension (% of image) — prevents corners from collapsing.
const MIN_CROP = 5;
// Default crop when "Custom crop" is first toggled on — slightly inset so the
// corner handles are visible inside the image.
const DEFAULT_CROP = { x: 5, y: 5, w: 90, h: 90 };

export function ImageInput({
  value,
  onChange,
}: {
  value: ImageItem[];
  onChange: (next: ImageItem[]) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const remaining = MAX_IMAGES - value.length;

  const addFiles = useCallback(
    (files: File[]) => {
      const accepted = files
        .filter((f) => f.type.startsWith("image/"))
        .slice(0, remaining);
      if (accepted.length === 0) return;
      const next: ImageItem[] = [
        ...value,
        ...accepted.map((file) => ({
          file,
          previewUrl: URL.createObjectURL(file),
        })),
      ];
      onChange(next);
    },
    [onChange, remaining, value],
  );

  // Revoke object URLs we created.
  useEffect(() => {
    return () => {
      for (const item of value) {
        if (item.file && item.previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(item.previewUrl);
        }
      }
    };
    // intentionally only on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Paste handler.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (!e.clipboardData) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      const items = Array.from(e.clipboardData.items);
      const blobs: File[] = [];
      for (const it of items) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const blob = it.getAsFile();
          if (blob) blobs.push(blobToImageFile(blob, "pasted"));
        }
      }
      if (blobs.length > 0) {
        e.preventDefault();
        addFiles(blobs);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!e.dataTransfer) return;
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
  }

  function move(idx: number, delta: number) {
    const target = idx + delta;
    if (target < 0 || target >= value.length) return;
    const next = value.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }

  function remove(idx: number) {
    const item = value[idx];
    if (item.file && item.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(item.previewUrl);
    }
    const next = value.slice();
    next.splice(idx, 1);
    onChange(next);
  }

  function setLabel(idx: number, label: string) {
    const next = value.slice();
    next[idx] = { ...next[idx], label };
    onChange(next);
  }

  function toggleCustomZoom(idx: number, on: boolean) {
    const next = value.slice();
    const cur = next[idx];
    if (on) {
      let zx = cur.zoomX ?? 50;
      let zy = cur.zoomY ?? 50;
      if (cur.customCrop) {
        const cx = cur.cropX ?? 0;
        const cy = cur.cropY ?? 0;
        const cw = cur.cropW ?? 100;
        const ch = cur.cropH ?? 100;
        zx = clamp(zx, cx, cx + cw);
        zy = clamp(zy, cy, cy + ch);
      }
      next[idx] = { ...cur, customZoom: true, zoomX: zx, zoomY: zy };
    } else {
      next[idx] = { ...cur, customZoom: false };
    }
    onChange(next);
  }

  function setZoom(idx: number, x: number, y: number) {
    const next = value.slice();
    const cur = next[idx];
    let zx = x;
    let zy = y;
    if (cur.customCrop) {
      const cx = cur.cropX ?? 0;
      const cy = cur.cropY ?? 0;
      const cw = cur.cropW ?? 100;
      const ch = cur.cropH ?? 100;
      zx = clamp(zx, cx, cx + cw);
      zy = clamp(zy, cy, cy + ch);
    }
    next[idx] = { ...cur, zoomX: zx, zoomY: zy };
    onChange(next);
  }

  function toggleCustomCrop(idx: number, on: boolean) {
    const next = value.slice();
    const cur = next[idx];
    if (on) {
      const cx = cur.cropX ?? DEFAULT_CROP.x;
      const cy = cur.cropY ?? DEFAULT_CROP.y;
      const cw = cur.cropW ?? DEFAULT_CROP.w;
      const ch = cur.cropH ?? DEFAULT_CROP.h;
      let zx = cur.zoomX ?? 50;
      let zy = cur.zoomY ?? 50;
      if (cur.customZoom) {
        zx = clamp(zx, cx, cx + cw);
        zy = clamp(zy, cy, cy + ch);
      }
      next[idx] = {
        ...cur,
        customCrop: true,
        cropX: cx,
        cropY: cy,
        cropW: cw,
        cropH: ch,
        zoomX: zx,
        zoomY: zy,
      };
    } else {
      next[idx] = { ...cur, customCrop: false };
    }
    onChange(next);
  }

  function setCrop(
    idx: number,
    cx: number,
    cy: number,
    cw: number,
    ch: number,
  ) {
    const next = value.slice();
    const cur = next[idx];
    let zx = cur.zoomX ?? 50;
    let zy = cur.zoomY ?? 50;
    if (cur.customZoom) {
      zx = clamp(zx, cx, cx + cw);
      zy = clamp(zy, cy, cy + ch);
    }
    next[idx] = {
      ...cur,
      cropX: cx,
      cropY: cy,
      cropW: cw,
      cropH: ch,
      zoomX: zx,
      zoomY: zy,
    };
    onChange(next);
  }

  const dropZoneCls = useMemo(
    () =>
      [
        "rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors",
        dragOver
          ? "border-primary bg-primary/5 text-foreground"
          : "border-border text-muted-foreground hover:border-foreground/40",
      ].join(" "),
    [dragOver],
  );

  return (
    <div className="space-y-3">
      {value.length < MAX_IMAGES && (
        <div
          className={dropZoneCls}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <p>
            Paste (Ctrl/Cmd+V), drop, or click to add up to{" "}
            <strong>{remaining}</strong> more image{remaining === 1 ? "" : "s"}.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              addFiles(files);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {value.length > 0 && (
        <>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {value.map((item, i) => (
              <li
                key={`${item.previewUrl}-${i}`}
                className="space-y-2 overflow-hidden rounded-lg border border-border bg-card p-2"
              >
                <ImagePreview
                  src={item.previewUrl}
                  alt={item.label || `image ${i + 1}`}
                  customZoom={item.customZoom ?? false}
                  zoomX={item.zoomX ?? 50}
                  zoomY={item.zoomY ?? 50}
                  onChangeZoom={(x, y) => setZoom(i, x, y)}
                  customCrop={item.customCrop ?? false}
                  cropX={item.cropX ?? DEFAULT_CROP.x}
                  cropY={item.cropY ?? DEFAULT_CROP.y}
                  cropW={item.cropW ?? DEFAULT_CROP.w}
                  cropH={item.cropH ?? DEFAULT_CROP.h}
                  onChangeCrop={(x, y, w, h) => setCrop(i, x, y, w, h)}
                />
                <Input
                  value={item.label ?? ""}
                  onChange={(e) => setLabel(i, e.target.value)}
                  placeholder="Label (optional)"
                  className="h-7"
                />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                    >
                      ←
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => move(i, 1)}
                      disabled={i === value.length - 1}
                    >
                      →
                    </Button>
                  </div>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <label className="inline-flex cursor-pointer select-none items-center gap-1.5 text-sm text-foreground" />
                      }
                    >
                      <input
                        type="checkbox"
                        checked={item.customCrop ?? false}
                        onChange={(e) => toggleCustomCrop(i, e.target.checked)}
                        className="h-3.5 w-3.5 cursor-pointer accent-primary"
                      />
                      <span>Custom crop</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Cropping is encouraged to maximize space on the cheat sheet
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <label className="inline-flex cursor-pointer select-none items-center gap-1.5 text-sm text-foreground" />
                      }
                    >
                      <input
                        type="checkbox"
                        checked={item.customZoom ?? false}
                        onChange={(e) => toggleCustomZoom(i, e.target.checked)}
                        className="h-3.5 w-3.5 cursor-pointer accent-primary"
                      />
                      <span>Custom zoom point</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Custom local zoom circle (unchecked defaults to center)
                    </TooltipContent>
                  </Tooltip>
                  <span className="ml-auto" />
                  <Button
                    type="button"
                    size="xs"
                    variant="destructive"
                    onClick={() => remove(i)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// Zoom-factor and indicator radius mirror the cheat-sheet (lineup-card.tsx)
// so the editor preview matches what users see at render time.
const ZOOM_FACTOR = 2.5;

type DragMode =
  | null
  | { kind: "zoom" }
  | { kind: "crop"; corner: "nw" | "ne" | "sw" | "se" };

function ImagePreview({
  src,
  alt,
  customZoom,
  zoomX,
  zoomY,
  onChangeZoom,
  customCrop,
  cropX,
  cropY,
  cropW,
  cropH,
  onChangeCrop,
}: {
  src: string;
  alt: string;
  customZoom: boolean;
  zoomX: number;
  zoomY: number;
  onChangeZoom: (x: number, y: number) => void;
  customCrop: boolean;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  onChangeCrop: (x: number, y: number, w: number, h: number) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<DragMode>(null);
  const [loaded, setLoaded] = useState(false);

  // Keep the latest crop in a ref so the drag handlers compute against the
  // committed value at each move rather than a stale closure.
  const cropRef = useRef({ x: cropX, y: cropY, w: cropW, h: cropH });
  useEffect(() => {
    cropRef.current = { x: cropX, y: cropY, w: cropW, h: cropH };
  }, [cropX, cropY, cropW, cropH]);

  // If the image was already cached, `onLoad` may have fired before this
  // component mounted — sync the loaded flag on mount so we drop the skeleton.
  useEffect(() => {
    const el = imgRef.current;
    if (el?.complete && (el.naturalWidth ?? 0) > 0) setLoaded(true);
  }, []);

  const pctFromClient = useCallback((clientX: number, clientY: number) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: clamp(((clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  }, []);

  const applyDrag = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragRef.current;
      if (!drag) return;
      const p = pctFromClient(clientX, clientY);
      if (!p) return;
      if (drag.kind === "zoom") {
        onChangeZoom(p.x, p.y);
        return;
      }
      // crop corner drag — compute new rectangle for the dragged corner.
      const cur = cropRef.current;
      let x = cur.x;
      let y = cur.y;
      let w = cur.w;
      let h = cur.h;
      if (drag.corner === "nw") {
        const nx = clamp(p.x, 0, cur.x + cur.w - MIN_CROP);
        const ny = clamp(p.y, 0, cur.y + cur.h - MIN_CROP);
        w = cur.x + cur.w - nx;
        h = cur.y + cur.h - ny;
        x = nx;
        y = ny;
      } else if (drag.corner === "ne") {
        const nx2 = clamp(p.x, cur.x + MIN_CROP, 100);
        const ny = clamp(p.y, 0, cur.y + cur.h - MIN_CROP);
        w = nx2 - cur.x;
        h = cur.y + cur.h - ny;
        y = ny;
      } else if (drag.corner === "sw") {
        const nx = clamp(p.x, 0, cur.x + cur.w - MIN_CROP);
        const ny2 = clamp(p.y, cur.y + MIN_CROP, 100);
        w = cur.x + cur.w - nx;
        h = ny2 - cur.y;
        x = nx;
      } else {
        // 'se'
        const nx2 = clamp(p.x, cur.x + MIN_CROP, 100);
        const ny2 = clamp(p.y, cur.y + MIN_CROP, 100);
        w = nx2 - cur.x;
        h = ny2 - cur.y;
      }
      onChangeCrop(x, y, w, h);
    },
    [onChangeCrop, onChangeZoom, pctFromClient],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const corner = target.getAttribute("data-crop-corner") as
      | "nw"
      | "ne"
      | "sw"
      | "se"
      | null;
    if (corner && customCrop) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { kind: "crop", corner };
      return;
    }
    if (!customZoom) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { kind: "zoom" };
    applyDrag(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    applyDrag(e.clientX, e.clientY);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // pointer already released
    }
  };

  return (
    <div
      ref={wrapperRef}
      className={
        "relative select-none touch-none " +
        (customZoom ? "cursor-crosshair" : "")
      }
      style={
        {
          // Roughly mirrors the cheat-sheet's `30% of image height` formula:
          // for a 16:9 image rendered at the wrapper width, height = width *
          // 9/16, so 30% of height ≈ 17% of width. We push slightly above
          // that with an 80px floor so the picker feels comfortably draggable
          // on the smaller single-column phone layout too.
          "--zoom-picker-radius": "clamp(80px, 18%, 110px)",
          // Reserve a 16:9 box while loading so cards keep their shape and
          // images don't pop in. Once loaded the image's natural ratio takes
          // over.
          aspectRatio: loaded ? undefined : "16 / 9",
        } as React.CSSProperties
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={() => setLoaded(true)}
        className={
          "block w-full rounded transition-opacity duration-150 " +
          (loaded ? "opacity-100" : "opacity-0")
        }
      />
      {/* Clip layer: holds the skeleton, zoom indicator, and crop dimming so
          their bounds stay inside the image. Crop corner handles are siblings
          of this div so they remain fully visible when dragged to 0%/100%. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded">
        {!loaded && (
          <div
            aria-hidden
            className="absolute inset-0 animate-pulse rounded border border-border/60 bg-muted"
          />
        )}
        {customZoom && loaded && (
          <>
            {/* Clipped, magnified copy — same math as the cheat-sheet zoom. */}
            <div
              className="absolute inset-0"
              style={{
                clipPath: `circle(var(--zoom-picker-radius) at ${zoomX}% ${zoomY}%)`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                aria-hidden
                draggable={false}
                className="object-contain"
                style={{
                  position: "absolute",
                  left: `${(1 - ZOOM_FACTOR) * zoomX}%`,
                  top: `${(1 - ZOOM_FACTOR) * zoomY}%`,
                  width: `${ZOOM_FACTOR * 100}%`,
                  height: `${ZOOM_FACTOR * 100}%`,
                  maxWidth: "none",
                  maxHeight: "none",
                }}
              />
            </div>
            <div
              className="absolute rounded-full border-2 border-white/90 shadow-[0_0_10px_rgba(0,0,0,0.55)]"
              style={{
                left: `${zoomX}%`,
                top: `${zoomY}%`,
                transform: "translate(-50%, -50%)",
                width: "calc(var(--zoom-picker-radius) * 2)",
                height: "calc(var(--zoom-picker-radius) * 2)",
              }}
            />
          </>
        )}
        {customCrop && loaded && (
          <div
            className="absolute outline outline-2 outline-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
            style={{
              left: `${cropX}%`,
              top: `${cropY}%`,
              width: `${cropW}%`,
              height: `${cropH}%`,
            }}
          />
        )}
      </div>
      {customCrop && loaded && (
        <>
          <CropCorner corner="nw" x={cropX} y={cropY} />
          <CropCorner corner="ne" x={cropX + cropW} y={cropY} />
          <CropCorner corner="sw" x={cropX} y={cropY + cropH} />
          <CropCorner corner="se" x={cropX + cropW} y={cropY + cropH} />
        </>
      )}
    </div>
  );
}

const CORNER_CURSOR: Record<"nw" | "ne" | "sw" | "se", string> = {
  nw: "cursor-nwse-resize",
  ne: "cursor-nesw-resize",
  sw: "cursor-nesw-resize",
  se: "cursor-nwse-resize",
};

function CropCorner({
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

function clamp(n: number, min = 0, max = 100): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
