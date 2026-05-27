"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EyeOff, Pencil } from "lucide-react";
import { ImageOverlay } from "@/components/image-overlay";
import { useAllLocalZoom } from "@/components/local-zoom-toggle";
import { ZoomCrosshair } from "@/components/zoom-crosshair";
import { hideLineup, unhideLineup } from "@/components/hidden-lineups";
import { useToast } from "@/components/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import agentsJson from "@/lib/data/agents.json";
import type {
  Agent,
  AgentAbility,
  AgentAbilityKey,
  FieldDefinition,
  LineupImage,
  LineupWithUrls,
} from "@/lib/types";

// Agent index for ability-icon lookups. agents.json is small (~10-15 KB) and
// already bundled client-side via the form, so importing here is free.
const AGENT_BY_SLUG = new Map<string, Agent>(
  (agentsJson as Agent[]).map((a) => [a.slug, a]),
);

// Halo + drop-shadow that reads on bright AND dark image regions.
const LABEL_TEXT_SHADOW =
  "0 0 4px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.95), 0 1px 2px rgba(0,0,0,0.95)";

export function LineupCard({
  lineup,
  fields,
}: {
  lineup: LineupWithUrls;
  fields: FieldDefinition[];
}) {
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const toast = useToast();
  const { abilities, textPrimary, secondary } = splitSummary(
    lineup.custom_fields,
    lineup.abilities ?? [],
    lineup.agent_slug,
    fields,
  );

  const onHide = () => {
    hideLineup(lineup.id);
    toast.show({
      message: "Lineup hidden",
      action: {
        label: "Undo",
        onClick: () => unhideLineup(lineup.id),
      },
    });
  };

  const isEmpty =
    abilities.length === 0 &&
    textPrimary.length === 0 &&
    secondary.length === 0;

  return (
    <>
      <div className="flex min-w-[280px] flex-col rounded-lg border border-border bg-card p-3">
        <div className="pl-1 pb-2 pt-1">
          {isEmpty ? (
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm italic text-muted-foreground/60">
                no summary
              </span>
              <div className="flex shrink-0 flex-col gap-1">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={onHide}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      />
                    }
                  >
                    <EyeOff className="h-3.5 w-3.5" aria-hidden />
                    Hide
                  </TooltipTrigger>
                  <TooltipContent side="left">Hide this lineup (only for you!)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Link
                        href={`/lineup/${lineup.id}`}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      />
                    }
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    Edit
                  </TooltipTrigger>
                  <TooltipContent side="left">Edit this lineup</TooltipContent>
                </Tooltip>
              </div>
            </div>
          ) : (
            // Ability icons sit in a left column sized to fill the combined
            // height of the title + secondary rows; notes (secondary) live in
            // the right column under the title instead of wrapping below the
            // icons full-width.
            <div className="flex items-center gap-4">
              {abilities.length > 0 && (
                <div className="flex shrink-0 items-center gap-1">
                  {abilities.map((a, idx) => (
                    <span key={idx} className="contents">
                      {idx > 0 && (
                        <span
                          aria-hidden
                          className="text-muted-foreground/70"
                        >
                          +
                        </span>
                      )}
                      <Tooltip>
                        <TooltipTrigger
                          render={<span className="inline-flex" />}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={a.icon}
                            alt={a.name}
                            className="h-12 w-12 object-contain"
                          />
                        </TooltipTrigger>
                        <TooltipContent>{a.name}</TooltipContent>
                      </Tooltip>
                    </span>
                  ))}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {textPrimary.length > 0 ? (
                    <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 text-lg font-medium leading-tight text-foreground">
                      {textPrimary.map((value, i) => (
                        <span key={i} className="contents">
                          {i > 0 && (
                            <span
                              aria-hidden
                              className="text-muted-foreground/70"
                            >
                              |
                            </span>
                          )}
                          <span className="truncate">{value}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="min-w-0 flex-1" />
                  )}
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={onHide}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        />
                      }
                    >
                      <EyeOff className="h-3.5 w-3.5" aria-hidden />
                      Hide
                    </TooltipTrigger>
                    <TooltipContent side="left">Hide this lineup (only for you!)</TooltipContent>
                  </Tooltip>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <div className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {secondary.length > 0 ? secondary.join(" · ") : " "}
                  </div>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Link
                          href={`/lineup/${lineup.id}`}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        />
                      }
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Edit
                    </TooltipTrigger>
                    <TooltipContent side="left">Edit this lineup</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          {lineup.images.map((img, i) => (
            <LineupImageItem
              key={`${img.path}-${i}`}
              image={img}
              onOpenFullscreen={setOpenUrl}
            />
          ))}
        </div>
      </div>
      {openUrl && (
        <ImageOverlay src={openUrl} onClose={() => setOpenUrl(null)} />
      )}
    </>
  );
}

// Per-image local-zoom anchor: stored as 0-100 % deltas on the image
// (`zoom_x` / `zoom_y` in JSONB). Missing values fall back to dead center.
const ZOOM_FACTOR = 2.5;

function LineupImageItem({
  image,
  onOpenFullscreen,
}: {
  image: LineupImage & { url: string };
  onOpenFullscreen: (url: string) => void;
}) {
  const bulkPin = useAllLocalZoom();
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(bulkPin);
  const [prevBulkPin, setPrevBulkPin] = useState(bulkPin);
  const [loaded, setLoaded] = useState(false);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const figRef = useRef<HTMLElement>(null);
  const [figDims, setFigDims] = useState<{ w: number; h: number; r: number } | null>(null);
  const zoomEnabled = image.zoom_enabled !== false;
  const showZoom = loaded && (hovered || pinned) && zoomEnabled;
  const showPin = loaded && (hovered || pinned) && zoomEnabled;

  const isCropped =
    image.crop_x !== undefined &&
    image.crop_y !== undefined &&
    image.crop_w !== undefined &&
    image.crop_h !== undefined;
  const cx = isCropped ? image.crop_x! : 0;
  const cy = isCropped ? image.crop_y! : 0;
  const cw = isCropped ? image.crop_w! : 100;
  const ch = isCropped ? image.crop_h! : 100;
  const zxImg = image.zoom_x ?? 50;
  const zyImg = image.zoom_y ?? 50;
  // Zoom point translated into the cropped figure's local coordinate system
  // (0-100 within the visible crop). Clamped because edits enforce the zoom
  // center lives inside the crop, but old data may not have been re-saved.
  const zfx = clamp01_100(((zxImg - cx) / cw) * 100);
  const zfy = clamp01_100(((zyImg - cy) / ch) * 100);
  const cropAspect =
    isCropped && natural ? (natural.w * cw) / (natural.h * ch) : null;

  // The "All zoom circles" checkbox bulk-sets pinned on every mounted image:
  // toggling it on pins all, toggling off unpins all (wiping any individual
  // overrides). Individual pin checkboxes still work normally until the next
  // bulk action. Sync during render rather than in an effect to avoid a
  // cascading-render warning.
  if (prevBulkPin !== bulkPin) {
    setPrevBulkPin(bulkPin);
    setPinned(bulkPin);
  }

  // If the image was already cached, `onLoad` may have fired before this
  // component mounted — sync the loaded flag on mount so we drop the skeleton.
  useEffect(() => {
    const el = imgRef.current;
    if (el?.complete && (el.naturalWidth ?? 0) > 0) {
      setLoaded(true);
      setNatural({ w: el.naturalWidth, h: el.naturalHeight });
    }
  }, []);

  useEffect(() => {
    const el = figRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const r = Math.max(28, Math.min(110, h * 0.3));
      if (w > 0 && h > 0) setFigDims({ w, h, r });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const connector = (() => {
    if (!figDims || !showZoom) return null;
    const cxPx = figDims.r;
    const cyPx = figDims.h / 2;
    const zxPx = (zfx / 100) * figDims.w;
    const zyPx = (zfy / 100) * figDims.h;
    const dx = zxPx - cxPx;
    const dy = zyPx - cyPx;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= figDims.r * 1.1) return null;
    const theta = Math.atan2(dy, dx);
    const alpha = Math.acos(figDims.r / d);
    return {
      t1x: cxPx + figDims.r * Math.cos(theta + alpha),
      t1y: cyPx + figDims.r * Math.sin(theta + alpha),
      t2x: cxPx + figDims.r * Math.cos(theta - alpha),
      t2y: cyPx + figDims.r * Math.sin(theta - alpha),
      zx: zxPx,
      zy: zyPx,
      vw: figDims.w,
      vh: figDims.h,
    };
  })();

  return (
    <figure
      ref={figRef}
      className="relative flex shrink-0 overflow-hidden"
      style={
        {
          height: "var(--lineup-image-height, 200px)",
          // When cropped, the absolutely-positioned <img> can't size the
          // figure for us — fix the aspect ratio explicitly once we know the
          // natural dimensions. Otherwise reserve a 16:9 placeholder while
          // loading and let the natural image set the final shape.
          aspectRatio: isCropped
            ? (cropAspect ?? "16 / 9")
            : loaded
              ? undefined
              : "16 / 9",
          "--lz-radius":
            "clamp(28px, calc(var(--lineup-image-height, 200px) * 0.3), 110px)",
        } as React.CSSProperties
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
        src={image.url}
        alt={image.label || "Lineup image"}
        loading="lazy"
        onLoad={(e) => {
          setLoaded(true);
          setNatural({
            w: e.currentTarget.naturalWidth,
            h: e.currentTarget.naturalHeight,
          });
        }}
        className={
          (isCropped ? "absolute " : "h-full w-auto ") +
          "cursor-zoom-in rounded border border-border/60 object-contain transition-opacity duration-150 " +
          (loaded ? "opacity-100" : "opacity-0")
        }
        style={
          isCropped
            ? {
                width: `${10000 / cw}%`,
                height: `${10000 / ch}%`,
                left: `${(-cx * 100) / cw}%`,
                top: `${(-cy * 100) / ch}%`,
                maxWidth: "none",
                maxHeight: "none",
              }
            : undefined
        }
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenFullscreen(image.url);
        }}
      />
      {loaded && !showZoom && zoomEnabled && <ZoomCrosshair x={zfx} y={zfy} />}
      {showZoom && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded">
          {connector && (
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox={`0 0 ${connector.vw} ${connector.vh}`}
              fill="none"
            >
              <line
                x1={connector.t1x} y1={connector.t1y}
                x2={connector.zx} y2={connector.zy}
                stroke="rgba(0,0,0,0.25)" strokeWidth="3"
              />
              <line
                x1={connector.t2x} y1={connector.t2y}
                x2={connector.zx} y2={connector.zy}
                stroke="rgba(0,0,0,0.25)" strokeWidth="3"
              />
              <line
                x1={connector.t1x} y1={connector.t1y}
                x2={connector.zx} y2={connector.zy}
                stroke="rgba(255,255,255,0.5)" strokeWidth="1"
              />
              <line
                x1={connector.t2x} y1={connector.t2y}
                x2={connector.zx} y2={connector.zy}
                stroke="rgba(255,255,255,0.5)" strokeWidth="1"
              />
            </svg>
          )}
          <div
            className="absolute inset-0"
            style={{
              clipPath: "circle(var(--lz-radius) at var(--lz-radius) 50%)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt=""
              aria-hidden
              className="object-contain"
              style={{
                position: "absolute",
                left: `calc(var(--lz-radius) - ${(zxImg * ZOOM_FACTOR * 100) / cw}%)`,
                top: `${50 - (zyImg * ZOOM_FACTOR * 100) / ch}%`,
                width: `${(ZOOM_FACTOR * 10000) / cw}%`,
                height: `${(ZOOM_FACTOR * 10000) / ch}%`,
                maxWidth: "none",
                maxHeight: "none",
              }}
            />
          </div>
          <div
            className="absolute overflow-hidden rounded-full border-2 border-white/85 shadow-[0_0_8px_rgba(0,0,0,0.4)]"
            style={{
              left: "var(--lz-radius)",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: "calc(var(--lz-radius) * 2)",
              height: "calc(var(--lz-radius) * 2)",
            }}
          >
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
        </div>
      )}
      {showPin && (
        <label
          className="absolute right-2 top-2 inline-flex cursor-pointer select-none items-center gap-1.5 rounded-md bg-black/55 px-2 py-0.5 text-sm font-medium text-white"
          style={{ textShadow: LABEL_TEXT_SHADOW }}
          title="Keep the local zoom on for this image"
        >
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
            className="h-3 w-3 cursor-pointer accent-primary"
            aria-label="Pin local zoom"
          />
          <span>Pin zoom circle</span>
        </label>
      )}
      {loaded && hovered && !zoomEnabled && (
        <span
          className="absolute right-2 top-2 inline-flex select-none items-center rounded-md bg-black/55 px-2 py-0.5 text-sm font-medium text-white"
          style={{ textShadow: LABEL_TEXT_SHADOW }}
        >
          No zoom circle (edit to enable)
        </span>
      )}
      {image.label && (
        <figcaption
          className="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-md bg-black/55 px-2 py-0.5 text-base font-medium text-white"
          style={{ textShadow: LABEL_TEXT_SHADOW }}
        >
          {image.label}
        </figcaption>
      )}
    </figure>
  );
}

function clamp01_100(n: number): number {
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

// Primary row ordering: ability icons, then title, then stance. Ability is no
// longer a custom field — it's the `lineup.abilities` text[] column rendered
// as icons inline with the surrounding text. Multiple abilities are joined
// visually with " + " between icons.
const PRIMARY_TEXT_KEYS = ["title", "stance"] as const;
const PRIMARY_KEYS = new Set<string>([...PRIMARY_TEXT_KEYS, "ability"]);

// Split into ability icons (own column on the card), text primary (title and
// stance, featured prominently to the right of the icons), and secondary
// (every other custom field, joined on a smaller muted line under the title).
// Secondary follows the field_definitions sort_order.
function splitSummary(
  custom: Record<string, string>,
  abilityKeys: AgentAbilityKey[],
  agentSlug: string,
  fields: FieldDefinition[],
): {
  abilities: AgentAbility[];
  textPrimary: string[];
  secondary: string[];
} {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const agent = AGENT_BY_SLUG.get(agentSlug);
  const abilities = abilityKeys
    .map((k) => agent?.abilities[k])
    .filter((a): a is AgentAbility => Boolean(a));
  const textPrimary: string[] = [];
  const title = custom?.title?.trim();
  if (title && byKey.has("title")) textPrimary.push(title);
  const stance = custom?.stance?.trim();
  if (stance && byKey.has("stance")) textPrimary.push(stance);
  const secondary: string[] = [];
  for (const f of fields) {
    if (PRIMARY_KEYS.has(f.key)) continue;
    const v = custom?.[f.key];
    if (v && v.trim()) secondary.push(v.trim());
  }
  return { abilities, textPrimary, secondary };
}

