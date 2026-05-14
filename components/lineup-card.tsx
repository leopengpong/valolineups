"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EyeOff } from "lucide-react";
import { ImageOverlay } from "@/components/image-overlay";
import { useAllLocalZoom } from "@/components/local-zoom-toggle";
import { hideLineup, unhideLineup } from "@/components/hidden-lineups";
import { useToast } from "@/components/toast";
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
  const toast = useToast();
  const { primary, secondary } = splitSummary(lineup.custom_fields, fields);

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
              {/* Always render the secondary line so cards with vs. without
                  notes align vertically when laid out side-by-side. */}
              <div className="mt-0.5 truncate text-sm text-muted-foreground">
                {secondary.length > 0 ? secondary.join(" · ") : " "}
              </div>
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
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const showZoom = loaded && (globalZoom || hovered || pinned);
  const showPin = loaded && (hovered || pinned);

  // If the image was already cached, `onLoad` may have fired before this
  // component mounted — sync the loaded flag on mount so we drop the skeleton.
  useEffect(() => {
    const el = imgRef.current;
    if (el?.complete && (el.naturalWidth ?? 0) > 0) setLoaded(true);
  }, []);

  return (
    <figure
      className="relative flex shrink-0"
      style={
        {
          height: "var(--lineup-image-height, 200px)",
          // Reserve a 16:9 box while loading so cards keep their shape and
          // images don't pop in. Once loaded the image's natural ratio takes
          // over.
          aspectRatio: loaded ? undefined : "16 / 9",
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
        onLoad={() => setLoaded(true)}
        className={
          "h-full w-auto cursor-zoom-in rounded border border-border/60 object-contain transition-opacity duration-150 " +
          (loaded ? "opacity-100" : "opacity-0")
        }
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
