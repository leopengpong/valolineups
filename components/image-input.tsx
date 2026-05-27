"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
  useSortable,
  rectSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { blobToImageFile } from "@/lib/image";
import { ZoomCrosshair } from "@/components/zoom-crosshair";

export type ImageItem = {
  file?: File;
  previewUrl: string;
  existingPath?: string;
  label?: string;
  zoomEnabled?: boolean;
  zoomX?: number;
  zoomY?: number;
  customCrop?: boolean;
  cropX?: number;
  cropY?: number;
  cropW?: number;
  cropH?: number;
};

const MAX_IMAGES = 5;

const MIN_CROP = 5;
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
    const oldIndex = value.findIndex((item) => item.previewUrl === active.id);
    const newIndex = value.findIndex((item) => item.previewUrl === over.id);
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
      zx = clamp(zx, cx, cx + cw);
      zy = clamp(zy, cy, cy + ch);
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
    zx = clamp(zx, cx, cx + cw);
    zy = clamp(zy, cy, cy + ch);
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
        <DndContext
          id="image-sort"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={value.map((item) => item.previewUrl)}
            strategy={rectSortingStrategy}
          >
            <ul className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
              {value.map((item, i) => (
                <SortableCard key={item.previewUrl} id={item.previewUrl}>
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
                              onChange={(e) =>
                                toggleCustomCrop(i, e.target.checked)
                              }
                              className="h-3.5 w-3.5 cursor-pointer accent-primary"
                            />
                            <span>Custom crop</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Cropping is encouraged to maximize space on the cheat
                            sheet
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
                              onChange={(e) =>
                                toggleZoomEnabled(i, e.target.checked)
                              }
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

function SortableCard({
  id,
  children,
}: {
  id: string;
  children: (handleProps: Record<string, unknown>) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="space-y-2 overflow-visible rounded-lg border border-border bg-card p-2"
    >
      {children({ ...attributes, ...listeners })}
    </li>
  );
}

function subscribeSm(cb: () => void) {
  const mq = window.matchMedia("(min-width: 640px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function getSmSnapshot(): boolean {
  return window.matchMedia("(min-width: 640px)").matches;
}

function getSmServerSnapshot(): boolean {
  return false;
}

const ZOOM_FACTOR = 2.5;
const CROSSHAIR_HIT_RADIUS = 39;

type DragMode =
  | null
  | { kind: "crosshair"; offsetX: number; offsetY: number }
  | { kind: "crop"; corner: "nw" | "ne" | "sw" | "se" };

function ImagePreview({
  src,
  alt,
  zoomEnabled,
  zoomX,
  zoomY,
  onChangeZoom,
  customCrop,
  cropX,
  cropY,
  cropW,
  cropH,
  onChangeCrop,
  columnIndex,
}: {
  src: string;
  alt: string;
  zoomEnabled: boolean;
  zoomX: number;
  zoomY: number;
  onChangeZoom: (x: number, y: number) => void;
  customCrop: boolean;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  onChangeCrop: (x: number, y: number, w: number, h: number) => void;
  columnIndex: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<DragMode>(null);
  const [loaded, setLoaded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hoveringCrosshair, setHoveringCrosshair] = useState(false);
  const [hoveringImage, setHoveringImage] = useState(false);
  const hoveringRef = useRef(false);

  const cropRef = useRef({ x: cropX, y: cropY, w: cropW, h: cropH });
  useEffect(() => {
    cropRef.current = { x: cropX, y: cropY, w: cropW, h: cropH };
  }, [cropX, cropY, cropW, cropH]);

  useEffect(() => {
    const el = imgRef.current;
    if (el?.complete && (el.naturalWidth ?? 0) > 0) setLoaded(true);
  }, []);

  const showZoomPanel = zoomEnabled && loaded;

  const wideEnough = useSyncExternalStore(subscribeSm, getSmSnapshot, getSmServerSnapshot);
  const circleOnRight = !wideEnough || columnIndex % 2 === 0;

  const [dims, setDims] = useState<{
    containerW: number;
    containerH: number;
    circleCx: number;
    circleCy: number;
    circleR: number;
    imageLeft: number;
    imageTop: number;
    imageW: number;
    imageH: number;
  } | null>(null);

  const measure = useCallback(() => {
    const cont = containerRef.current;
    const imgWrap = wrapperRef.current;
    if (!cont || !imgWrap) {
      setDims(null);
      return;
    }
    const contRect = cont.getBoundingClientRect();
    const imgRect = imgWrap.getBoundingClientRect();
    if (imgRect.width === 0 || imgRect.height === 0) {
      setDims(null);
      return;
    }
    const r = Math.max(28, Math.min(110, imgRect.height * 0.3));
    const gap = 4;
    setDims({
      containerW: contRect.width,
      containerH: contRect.height,
      circleCx: circleOnRight ? contRect.width + gap + r : -(gap + r),
      circleCy: contRect.height / 2,
      circleR: r,
      imageLeft: imgRect.left - contRect.left,
      imageTop: imgRect.top - contRect.top,
      imageW: imgRect.width,
      imageH: imgRect.height,
    });
  }, [circleOnRight]);

  useEffect(() => {
    const cont = containerRef.current;
    if (!cont) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(cont);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(measure, [loaded, zoomEnabled, circleOnRight, measure]);

  const connector = useMemo(() => {
    if (!dims || !showZoomPanel) return null;
    const crossX = dims.imageLeft + (zoomX / 100) * dims.imageW;
    const crossY = dims.imageTop + (zoomY / 100) * dims.imageH;
    const dx = crossX - dims.circleCx;
    const dy = crossY - dims.circleCy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= dims.circleR * 1.1) return null;
    const theta = Math.atan2(dy, dx);
    const alpha = Math.acos(Math.min(1, dims.circleR / d));
    return {
      t1x: dims.circleCx + dims.circleR * Math.cos(theta + alpha),
      t1y: dims.circleCy + dims.circleR * Math.sin(theta + alpha),
      t2x: dims.circleCx + dims.circleR * Math.cos(theta - alpha),
      t2y: dims.circleCy + dims.circleR * Math.sin(theta - alpha),
      zx: crossX,
      zy: crossY,
      vw: dims.containerW,
      vh: dims.containerH,
    };
  }, [dims, showZoomPanel, zoomX, zoomY]);

  const zoomImgStyle = useMemo((): React.CSSProperties | null => {
    if (!dims || dims.circleR <= 0) return null;
    const circleDiam = dims.circleR * 2;
    const scaleW = ((dims.imageW * ZOOM_FACTOR) / circleDiam) * 100;
    const scaleH = ((dims.imageH * ZOOM_FACTOR) / circleDiam) * 100;
    return {
      position: "absolute",
      width: `${scaleW}%`,
      height: `${scaleH}%`,
      left: `${50 - (zoomX / 100) * scaleW}%`,
      top: `${50 - (zoomY / 100) * scaleH}%`,
      maxWidth: "none",
      maxHeight: "none",
    };
  }, [dims, zoomX, zoomY]);

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
      if (drag.kind === "crosshair") {
        onChangeZoom(
          clamp(p.x - drag.offsetX, 0, 100),
          clamp(p.y - drag.offsetY, 0, 100),
        );
        return;
      }
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
    if (!zoomEnabled) return;
    if (
      !wrapperRef.current ||
      !isOverCrosshair(e.clientX, e.clientY, wrapperRef.current, zoomX, zoomY)
    )
      return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = pctFromClient(e.clientX, e.clientY);
    if (!p) return;
    dragRef.current = {
      kind: "crosshair",
      offsetX: p.x - zoomX,
      offsetY: p.y - zoomY,
    };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      applyDrag(e.clientX, e.clientY);
      return;
    }
    if (zoomEnabled && wrapperRef.current) {
      const over = isOverCrosshair(
        e.clientX,
        e.clientY,
        wrapperRef.current,
        zoomX,
        zoomY,
      );
      if (over !== hoveringRef.current) {
        hoveringRef.current = over;
        setHoveringCrosshair(over);
      }
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const wasDragKind = dragRef.current.kind;
    dragRef.current = null;
    setDragging(false);
    if (wasDragKind === "crosshair" && wrapperRef.current) {
      const over = isOverCrosshair(
        e.clientX,
        e.clientY,
        wrapperRef.current,
        zoomX,
        zoomY,
      );
      hoveringRef.current = over;
      setHoveringCrosshair(over);
    }
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (rect) {
      setHoveringImage(
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom,
      );
    }
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // pointer already released
    }
  };

  return (
    <div ref={containerRef} className="relative" style={showZoomPanel && (hoveringImage || dragging) ? { zIndex: 10 } : undefined}>
      <div
        ref={wrapperRef}
        className={
          "relative select-none touch-none " +
          (dragging
            ? "cursor-grabbing"
            : hoveringCrosshair && zoomEnabled
              ? "cursor-grab"
              : "")
        }
        style={{ aspectRatio: loaded ? undefined : "16 / 9" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerEnter={() => setHoveringImage(true)}
        onPointerLeave={() => {
          if (!dragRef.current) {
            hoveringRef.current = false;
            setHoveringCrosshair(false);
            setHoveringImage(false);
          }
        }}
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
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded">
          {!loaded && (
            <div
              aria-hidden
              className="absolute inset-0 animate-pulse rounded border border-border/60 bg-muted"
            />
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
          {zoomEnabled && loaded && <ZoomCrosshair x={zoomX} y={zoomY} />}
        </div>
        {zoomEnabled && loaded && (
          <>
            <div
              className="pointer-events-none absolute rounded-full"
              style={{
                left: `${zoomX}%`,
                top: `${zoomY}%`,
                width: CROSSHAIR_HIT_RADIUS * 2,
                height: CROSSHAIR_HIT_RADIUS * 2,
                transform: "translate(-50%, -50%)",
                border: "1.5px solid rgba(255,255,255,0.85)",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
              }}
            />
            <div
              className="pointer-events-none absolute whitespace-nowrap text-xs font-medium"
              style={{
                left: `${zoomX}%`,
                top: `${zoomY}%`,
                transform: `translate(-50%, ${CROSSHAIR_HIT_RADIUS + 4}px)`,
                color: "white",
                textShadow:
                  "0 1px 3px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)",
              }}
            >
              Click + drag me!
            </div>
          </>
        )}
        {customCrop && loaded && (
          <>
            <CropCorner corner="nw" x={cropX} y={cropY} />
            <CropCorner corner="ne" x={cropX + cropW} y={cropY} />
            <CropCorner corner="sw" x={cropX} y={cropY + cropH} />
            <CropCorner corner="se" x={cropX + cropW} y={cropY + cropH} />
          </>
        )}
      </div>
      {showZoomPanel && (hoveringImage || dragging) && (
        <div
          className="pointer-events-none absolute overflow-hidden rounded-full border-2 border-white/85 shadow-[0_0_8px_rgba(0,0,0,0.4)]"
          style={{
            top: "50%",
            transform: "translateY(-50%)",
            width: dims ? dims.circleR * 2 : 90,
            height: dims ? dims.circleR * 2 : 90,
            ...(circleOnRight
              ? { left: "calc(100% + 4px)" }
              : { right: "calc(100% + 4px)" }),
          }}
        >
          {zoomImgStyle && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={src}
              alt=""
              aria-hidden
              draggable={false}
              className="object-contain"
              style={zoomImgStyle}
            />
          )}
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
          >
            <polygon
              points="47,0 53,0 50,7.5"
              fill="white"
              fillOpacity="0.85"
            />
            <polygon
              points="47,100 53,100 50,92.5"
              fill="white"
              fillOpacity="0.85"
            />
            <polygon
              points="0,47 0,53 7.5,50"
              fill="white"
              fillOpacity="0.85"
            />
            <polygon
              points="100,47 100,53 92.5,50"
              fill="white"
              fillOpacity="0.85"
            />
          </svg>
        </div>
      )}
      {connector && (hoveringImage || dragging) && (
        <svg
          className="absolute inset-0 h-full w-full pointer-events-none"
          viewBox={`0 0 ${connector.vw} ${connector.vh}`}
          fill="none"
          overflow="visible"
        >
          <line
            x1={connector.t1x}
            y1={connector.t1y}
            x2={connector.zx}
            y2={connector.zy}
            stroke="rgba(0,0,0,0.25)"
            strokeWidth="3"
          />
          <line
            x1={connector.t2x}
            y1={connector.t2y}
            x2={connector.zx}
            y2={connector.zy}
            stroke="rgba(0,0,0,0.25)"
            strokeWidth="3"
          />
          <line
            x1={connector.t1x}
            y1={connector.t1y}
            x2={connector.zx}
            y2={connector.zy}
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="1"
          />
          <line
            x1={connector.t2x}
            y1={connector.t2y}
            x2={connector.zx}
            y2={connector.zy}
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="1"
          />
        </svg>
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

function isOverCrosshair(
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
  return dx * dx + dy * dy <= CROSSHAIR_HIT_RADIUS * CROSSHAIR_HIT_RADIUS;
}

function clamp(n: number, min = 0, max = 100): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
