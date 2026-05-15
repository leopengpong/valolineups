"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EyeOff } from "lucide-react";
import { ImageOverlay } from "@/components/image-overlay";
import { useAllLocalZoom } from "@/components/local-zoom-toggle";
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
      <div className="group relative flex min-w-[280px] flex-col rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted">
        <button
          type="button"
          onClick={onHide}
          title="Hide this lineup"
          aria-label="Hide this lineup"
          className="absolute right-1.5 top-1.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-60 transition-opacity hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <EyeOff className="h-4 w-4" aria-hidden />
        </button>
        <Link
          href={`/lineup/${lineup.id}`}
          className="block pl-1 pr-9 pb-2 pt-1 hover:opacity-90"
          title={summaryTitle(abilities, textPrimary, secondary) || "Edit lineup"}
        >
          {isEmpty ? (
            <span className="text-sm italic text-muted-foreground/60">
              no summary
            </span>
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
                {textPrimary.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-2 text-lg font-medium leading-tight text-foreground">
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
                )}
                {/* Always render the secondary line so cards with vs. without
                    notes align vertically when laid out side-by-side. */}
                <div className="mt-0.5 truncate text-sm text-muted-foreground">
                  {secondary.length > 0 ? secondary.join(" · ") : " "}
                </div>
              </div>
            </div>
          )}
        </Link>
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
  const [pinned, setPinned] = useState(false);
  const [prevBulkPin, setPrevBulkPin] = useState(bulkPin);
  const [loaded, setLoaded] = useState(false);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const showZoom = loaded && (hovered || pinned);
  const showPin = loaded && (hovered || pinned);

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

  return (
    <figure
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
      {showZoom && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded">
          <div
            className="absolute inset-0"
            style={{
              clipPath: `circle(var(--lz-radius) at ${zfx}% ${zfy}%)`,
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
                left: `${((zxImg * (1 - ZOOM_FACTOR) - cx) * 100) / cw}%`,
                top: `${((zyImg * (1 - ZOOM_FACTOR) - cy) * 100) / ch}%`,
                width: `${(ZOOM_FACTOR * 10000) / cw}%`,
                height: `${(ZOOM_FACTOR * 10000) / ch}%`,
                maxWidth: "none",
                maxHeight: "none",
              }}
            />
          </div>
          <div
            className="absolute rounded-full border-2 border-white/85 shadow-[0_0_8px_rgba(0,0,0,0.4)]"
            style={{
              left: `${zfx}%`,
              top: `${zfy}%`,
              transform: "translate(-50%, -50%)",
              width: "calc(var(--lz-radius) * 2)",
              height: "calc(var(--lz-radius) * 2)",
            }}
          />
        </div>
      )}
      {showPin && (
        <label
          className="absolute left-2 top-2 inline-flex cursor-pointer select-none items-center gap-1.5 rounded-md bg-black/55 px-2 py-0.5 text-sm font-medium text-white"
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
          <span>Pin zoom</span>
        </label>
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

// Plain-text tooltip on the card link. Joins ability names so the hover title
// stays meaningful even when the visible row is just icons.
function summaryTitle(
  abilities: AgentAbility[],
  textPrimary: string[],
  secondary: string[],
): string {
  const parts: string[] = [];
  if (abilities.length > 0) {
    parts.push(abilities.map((a) => a.name).join(" + "));
  }
  for (const t of textPrimary) parts.push(t);
  for (const v of secondary) parts.push(v);
  return parts.join(" · ");
}
