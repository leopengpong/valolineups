"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ZoomCrosshair } from "@/components/zoom-crosshair";
import { CropCorner, isOverCrosshair, clamp } from "./crop-editor";

const ZOOM_FACTOR = 2.5;
const CROSSHAIR_HIT_RADIUS = 39;
const MIN_CROP = 5;

type DragMode =
  | null
  | { kind: "crosshair"; offsetX: number; offsetY: number }
  | { kind: "crop"; corner: "nw" | "ne" | "sw" | "se" };

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

export function ImagePreview({
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
            <polygon points="47,0 53,0 50,7.5" fill="white" fillOpacity="0.85" />
            <polygon points="47,100 53,100 50,92.5" fill="white" fillOpacity="0.85" />
            <polygon points="0,47 0,53 7.5,50" fill="white" fillOpacity="0.85" />
            <polygon points="100,47 100,53 92.5,50" fill="white" fillOpacity="0.85" />
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
          <line x1={connector.t1x} y1={connector.t1y} x2={connector.zx} y2={connector.zy} stroke="rgba(0,0,0,0.25)" strokeWidth="3" />
          <line x1={connector.t2x} y1={connector.t2y} x2={connector.zx} y2={connector.zy} stroke="rgba(0,0,0,0.25)" strokeWidth="3" />
          <line x1={connector.t1x} y1={connector.t1y} x2={connector.zx} y2={connector.zy} stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
          <line x1={connector.t2x} y1={connector.t2y} x2={connector.zx} y2={connector.zy} stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
        </svg>
      )}
    </div>
  );
}
