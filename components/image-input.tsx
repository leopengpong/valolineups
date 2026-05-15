"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  // render time.
  customZoom?: boolean;
  zoomX?: number; // 0-100
  zoomY?: number; // 0-100
};

const MAX_IMAGES = 3;

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
      next[idx] = {
        ...cur,
        customZoom: true,
        zoomX: cur.zoomX ?? 50,
        zoomY: cur.zoomY ?? 50,
      };
    } else {
      next[idx] = { ...cur, customZoom: false };
    }
    onChange(next);
  }

  function setZoom(idx: number, x: number, y: number) {
    const next = value.slice();
    next[idx] = { ...next[idx], zoomX: x, zoomY: y };
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
          <p className="text-xs text-muted-foreground">
            No custom zoom point = the image zooms its dead center by default.
          </p>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {value.map((item, i) => (
              <li
                key={`${item.previewUrl}-${i}`}
                className="space-y-2 overflow-hidden rounded-lg border border-border bg-card p-2"
              >
                <ZoomPicker
                  src={item.previewUrl}
                  alt={item.label || `image ${i + 1}`}
                  customZoom={item.customZoom ?? false}
                  zoomX={item.zoomX ?? 50}
                  zoomY={item.zoomY ?? 50}
                  onChange={(x, y) => setZoom(i, x, y)}
                />
                <Input
                  value={item.label ?? ""}
                  onChange={(e) => setLabel(i, e.target.value)}
                  placeholder="Label (optional)"
                  className="h-7"
                />
                <div className="flex items-center gap-1 text-xs">
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
                  <label className="ml-3 inline-flex cursor-pointer select-none items-center gap-1.5 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={item.customZoom ?? false}
                      onChange={(e) => toggleCustomZoom(i, e.target.checked)}
                      className="h-3.5 w-3.5 cursor-pointer accent-primary"
                    />
                    <span>Custom zoom point</span>
                  </label>
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

function ZoomPicker({
  src,
  alt,
  customZoom,
  zoomX,
  zoomY,
  onChange,
}: {
  src: string;
  alt: string;
  customZoom: boolean;
  zoomX: number;
  zoomY: number;
  onChange: (x: number, y: number) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const draggingRef = useRef(false);
  const [loaded, setLoaded] = useState(false);

  // If the image was already cached, `onLoad` may have fired before this
  // component mounted — sync the loaded flag on mount so we drop the skeleton.
  useEffect(() => {
    const el = imgRef.current;
    if (el?.complete && (el.naturalWidth ?? 0) > 0) setLoaded(true);
  }, []);

  const updateFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;
      const x = clamp(((clientX - rect.left) / rect.width) * 100);
      const y = clamp(((clientY - rect.top) / rect.height) * 100);
      onChange(x, y);
    },
    [onChange],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!customZoom) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    updateFromClient(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!customZoom || !draggingRef.current) return;
    updateFromClient(e.clientX, e.clientY);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
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
      {!loaded && (
        <div
          aria-hidden
          className="absolute inset-0 animate-pulse rounded border border-border/60 bg-muted"
        />
      )}
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
      {customZoom && loaded && (
        <>
          {/* Clipped, magnified copy — same math as the cheat-sheet zoom. */}
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden rounded"
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
            className="pointer-events-none absolute rounded-full border-2 border-white/90 shadow-[0_0_10px_rgba(0,0,0,0.55)]"
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
    </div>
  );
}

function clamp(n: number): number {
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}
