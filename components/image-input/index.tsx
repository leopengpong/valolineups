"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { blobToImageFile } from "@/lib/image";
import type { ImageItem } from "./types";
import { SortableCard } from "./sortable-card";
import { ImagePreview } from "./image-preview";

export type { ImageItem } from "./types";

const MAX_IMAGES = 5;
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
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
        })),
      ];
      onChange(next);
    },
    [onChange, remaining, value],
  );

  useEffect(() => {
    return () => {
      for (const item of value) {
        if (item.file && item.previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(item.previewUrl);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = value.findIndex((item) => item.id === active.id);
    const newIndex = value.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange(arrayMove(value, oldIndex, newIndex));
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

  function toggleZoomEnabled(idx: number, on: boolean) {
    const next = value.slice();
    next[idx] = { ...next[idx], zoomEnabled: on };
    onChange(next);
  }

  function resetZoom(idx: number) {
    const next = value.slice();
    const cur = next[idx];
    let zx = 50;
    let zy = 50;
    if (cur.customCrop) {
      const cx = cur.cropX ?? 0;
      const cy = cur.cropY ?? 0;
      const cw = cur.cropW ?? 100;
      const ch = cur.cropH ?? 100;
      zx = cx + cw / 2;
      zy = cy + ch / 2;
    }
    next[idx] = { ...cur, zoomX: zx, zoomY: zy };
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
      const clamp = (n: number, lo: number, hi: number) => n < lo ? lo : n > hi ? hi : n;
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
      const clamp = (n: number, lo: number, hi: number) => n < lo ? lo : n > hi ? hi : n;
      let zx = clamp(cur.zoomX ?? 50, cx, cx + cw);
      let zy = clamp(cur.zoomY ?? 50, cy, cy + ch);
      next[idx] = { ...cur, customCrop: true, cropX: cx, cropY: cy, cropW: cw, cropH: ch, zoomX: zx, zoomY: zy };
    } else {
      next[idx] = { ...cur, customCrop: false };
    }
    onChange(next);
  }

  function setCrop(idx: number, cx: number, cy: number, cw: number, ch: number) {
    const next = value.slice();
    const cur = next[idx];
    const clamp = (n: number, lo: number, hi: number) => n < lo ? lo : n > hi ? hi : n;
    const zx = clamp(cur.zoomX ?? 50, cx, cx + cw);
    const zy = clamp(cur.zoomY ?? 50, cy, cy + ch);
    next[idx] = { ...cur, cropX: cx, cropY: cy, cropW: cw, cropH: ch, zoomX: zx, zoomY: zy };
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
        <DndContext
          id="image-sort"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={value.map((item) => item.id)}
            strategy={rectSortingStrategy}
          >
            <ul className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
              {value.map((item, i) => (
                <SortableCard key={item.id} id={item.id}>
                  {(handleProps) => (
                    <>
                      <ImagePreview
                        src={item.previewUrl}
                        alt={item.label || `image ${i + 1}`}
                        zoomEnabled={item.zoomEnabled ?? true}
                        zoomX={item.zoomX ?? 50}
                        zoomY={item.zoomY ?? 50}
                        onChangeZoom={(x, y) => setZoom(i, x, y)}
                        customCrop={item.customCrop ?? false}
                        cropX={item.cropX ?? DEFAULT_CROP.x}
                        cropY={item.cropY ?? DEFAULT_CROP.y}
                        cropW={item.cropW ?? DEFAULT_CROP.w}
                        cropH={item.cropH ?? DEFAULT_CROP.h}
                        onChangeCrop={(x, y, w, h) => setCrop(i, x, y, w, h)}
                        columnIndex={i}
                      />
                      <div className="flex items-center gap-2">
                        <div
                          {...handleProps}
                          className="flex cursor-grab touch-none items-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
                        >
                          <GripVertical className="h-5 w-5" />
                        </div>
                        <Input
                          value={item.label ?? ""}
                          onChange={(e) => setLabel(i, e.target.value)}
                          placeholder="Label (optional)"
                          className="h-7"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
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
                              checked={item.zoomEnabled ?? true}
                              onChange={(e) => toggleZoomEnabled(i, e.target.checked)}
                              className="h-3.5 w-3.5 cursor-pointer accent-primary"
                            />
                            <span>Enable large crosshair + zoom point</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Show zoom circle on hover in cheat sheet view
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="xs"
                          variant="destructive"
                          onClick={() => remove(i)}
                        >
                          Remove
                        </Button>
                        {(item.zoomEnabled ?? true) && (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => resetZoom(i)}
                          >
                            Reset crosshair + zoom point to center
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </SortableCard>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
