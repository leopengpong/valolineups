"use client";

import { useState } from "react";
import Link from "next/link";
import { ImageOverlay } from "@/components/image-overlay";
import { useAllLocalZoom } from "@/components/local-zoom-toggle";
import type { FieldDefinition, LineupImage, LineupWithUrls } from "@/lib/types";

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
  const allZoom = useAllLocalZoom();
  const { primary, secondary } = splitSummary(lineup.custom_fields, fields);

  return (
    <>
      <div className="group flex min-w-[280px] flex-col rounded-lg border border-border bg-card/40 p-3 transition-colors hover:bg-card/70">
        <Link
          href={`/lineup/${lineup.id}`}
          className="block px-1 pb-2 pt-1 hover:opacity-90"
          title={[...primary, ...secondary].join(" · ") || "Edit lineup"}
        >
          {primary.length === 0 && secondary.length === 0 ? (
            <span className="text-sm italic text-muted-foreground/60">
              no summary
            </span>
          ) : (
            <>
              {primary.length > 0 && (
                <div className="flex flex-wrap items-baseline gap-x-2 text-lg font-medium leading-tight text-foreground">
                  {primary.map((v, i) => (
                    <span key={i} className="contents">
                      {i > 0 && (
                        <span className="text-muted-foreground/60">·</span>
                      )}
                      <span className="truncate">{v}</span>
                    </span>
                  ))}
                </div>
              )}
              {secondary.length > 0 && (
                <div className="mt-0.5 truncate text-sm text-muted-foreground">
                  {secondary.join(" · ")}
                </div>
              )}
            </>
          )}
        </Link>
        <div className="flex gap-3">
          {lineup.images.map((img, i) => (
            <LineupImageItem
              key={`${img.path}-${i}`}
              image={img}
              globalZoom={allZoom}
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

// Hardcoded local-zoom point. Per-image zoom points become editable in the
// next feature; until then, every image zooms its dead-center.
const ZOOM_X = 0.5;
const ZOOM_Y = 0.5;
const ZOOM_FACTOR = 2.5;

function LineupImageItem({
  image,
  globalZoom,
  onOpenFullscreen,
}: {
  image: LineupImage & { url: string };
  globalZoom: boolean;
  onOpenFullscreen: (url: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const showZoom = globalZoom || hovered || pinned;
  const showPin = hovered || pinned;

  return (
    <figure
      className="relative flex shrink-0"
      style={
        {
          height: "var(--lineup-image-height, 200px)",
          "--lz-radius":
            "clamp(28px, calc(var(--lineup-image-height, 200px) * 0.3), 110px)",
        } as React.CSSProperties
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.url}
        alt={image.label || "Lineup image"}
        loading="lazy"
        className="h-full w-auto cursor-zoom-in rounded border border-border/60 object-contain"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenFullscreen(image.url);
        }}
      />
      {showZoom && (
        <>
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden rounded"
            style={{
              clipPath: `circle(var(--lz-radius) at ${ZOOM_X * 100}% ${ZOOM_Y * 100}%)`,
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
                left: `${(1 - ZOOM_FACTOR) * ZOOM_X * 100}%`,
                top: `${(1 - ZOOM_FACTOR) * ZOOM_Y * 100}%`,
                width: `${ZOOM_FACTOR * 100}%`,
                height: `${ZOOM_FACTOR * 100}%`,
                maxWidth: "none",
                maxHeight: "none",
              }}
            />
          </div>
          <div
            className="pointer-events-none absolute rounded-full border-2 border-white/85 shadow-[0_0_8px_rgba(0,0,0,0.4)]"
            style={{
              left: `${ZOOM_X * 100}%`,
              top: `${ZOOM_Y * 100}%`,
              transform: "translate(-50%, -50%)",
              width: "calc(var(--lz-radius) * 2)",
              height: "calc(var(--lz-radius) * 2)",
            }}
          />
        </>
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

// Featured fields shown in the prominent primary row. Order matters: title
// first, then ability, then stance.
const PRIMARY_ORDER = ["title", "ability", "stance"] as const;
const PRIMARY_KEYS = new Set<string>(PRIMARY_ORDER);

// Split custom fields into "primary" (title/ability/stance — featured
// prominently) and "secondary" (everything else — smaller muted line).
// Secondary follows the field_definitions sort_order.
function splitSummary(
  custom: Record<string, string>,
  fields: FieldDefinition[],
): { primary: string[]; secondary: string[] } {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const primary: string[] = [];
  for (const k of PRIMARY_ORDER) {
    const v = custom?.[k];
    if (v && v.trim() && byKey.has(k)) primary.push(v.trim());
  }
  const secondary: string[] = [];
  for (const f of fields) {
    if (PRIMARY_KEYS.has(f.key)) continue;
    const v = custom?.[f.key];
    if (v && v.trim()) secondary.push(v.trim());
  }
  return { primary, secondary };
}
