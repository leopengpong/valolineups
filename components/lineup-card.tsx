"use client";

import { useState } from "react";
import Link from "next/link";
import { ImageOverlay } from "@/components/image-overlay";
import type { FieldDefinition, LineupWithUrls } from "@/lib/types";

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
  const span = Math.max(1, Math.min(3, lineup.images.length));
  const { primary, secondary } = splitSummary(lineup.custom_fields, fields);

  return (
    <>
      <div
        className="group rounded-lg border border-border bg-card/40 p-3 transition-colors hover:bg-card/70"
        style={{ gridColumn: `span ${span}` }}
      >
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
            <figure
              key={`${img.path}-${i}`}
              className="relative flex min-w-0 flex-1 flex-col"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.label || "Lineup image"}
                loading="lazy"
                className="aspect-video w-full cursor-zoom-in rounded border border-border/60 object-cover"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpenUrl(img.url);
                }}
              />
              {img.label && (
                <figcaption
                  className="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-md bg-black/55 px-2 py-0.5 text-base font-medium text-white"
                  style={{ textShadow: LABEL_TEXT_SHADOW }}
                >
                  {img.label}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      </div>
      {openUrl && (
        <ImageOverlay src={openUrl} onClose={() => setOpenUrl(null)} />
      )}
    </>
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
