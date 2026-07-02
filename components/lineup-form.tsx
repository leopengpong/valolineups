"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageInput, type ImageItem } from "@/components/image-input";
import { compressImage } from "@/lib/image";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { ABILITY_KEYS, STORAGE_BUCKET } from "@/lib/types";
import type {
  Agent,
  AgentAbilityKey,
  FieldDefinition,
  Map as MapRow,
  Side,
} from "@/lib/types";

const MAX_TEXT = 512;

const STANCE_PRESETS = [
  "Standing",
  "Crouching",
  "Jumping",
  "Running",
  "Run + Jumping",
];

type InitialValue = {
  id?: string;
  mapSlug?: string;
  agentSlug?: string;
  side?: Side;
  images: ImageItem[];
  customFields: Record<string, string>;
  abilities?: AgentAbilityKey[];
};

function serializeImage(img: ImageItem) {
  return {
    ep: img.existingPath ?? null,
    nf: Boolean(img.file),
    l: img.label ?? "",
    t: img.text ?? "",
    ze: img.zoomEnabled ?? true,
    zx: img.zoomX ?? 50,
    zy: img.zoomY ?? 50,
    cc: img.customCrop ?? false,
    cx: img.cropX,
    cy: img.cropY,
    cw: img.cropW,
    ch: img.cropH,
  };
}

function snap(
  mapSlug: string,
  agentSlug: string,
  side: Side,
  images: ImageItem[],
  customFields: Record<string, string>,
  abilities: AgentAbilityKey[],
) {
  return JSON.stringify({
    mapSlug,
    agentSlug,
    side,
    images: images.map(serializeImage),
    customFields,
    abilities,
  });
}

export function LineupForm({
  maps,
  agents,
  fields,
  initial,
  prefilledFilters,
}: {
  maps: MapRow[];
  agents: Agent[];
  fields: FieldDefinition[];
  initial?: InitialValue;
  prefilledFilters?: { map?: string; agent?: string; side?: Side };
}) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const isEdit = Boolean(initial?.id);

  function invalidateLineupCaches() {
    mutate(
      (key) => Array.isArray(key) && key[0] === "lineups",
      undefined,
      { revalidate: true },
    );
  }

  const [mapSlug, setMapSlug] = useState<string>(
    initial?.mapSlug ?? prefilledFilters?.map ?? "",
  );
  const [agentSlug, setAgentSlug] = useState<string>(
    initial?.agentSlug ?? prefilledFilters?.agent ?? "",
  );
  const [side, setSide] = useState<Side>(
    initial?.side ?? prefilledFilters?.side ?? "attack",
  );
  const [images, setImages] = useState<ImageItem[]>(initial?.images ?? []);
  const [customFields, setCustomFields] = useState<Record<string, string>>(
    initial?.customFields ?? {},
  );
  const [abilities, setAbilities] = useState<AgentAbilityKey[]>(
    initial?.abilities ?? (initial?.id ? [] : ["ability1"]),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const pendingNavRef = useRef<(() => void) | null>(null);

  const [initialSnap] = useState(() =>
    snap(
      initial?.mapSlug ?? prefilledFilters?.map ?? "",
      initial?.agentSlug ?? prefilledFilters?.agent ?? "",
      initial?.side ?? prefilledFilters?.side ?? "attack",
      initial?.images ?? [],
      initial?.customFields ?? {},
      initial?.abilities ?? (initial?.id ? [] : ["ability1"]),
    ),
  );

  const titleField = fields.find((f) => f.key === "title");
  const stanceField = fields.find((f) => f.key === "stance");
  const otherFields = useMemo(
    () => fields.filter((f) => f.key !== "title" && f.key !== "stance" && f.key !== "ability"),
    [fields],
  );

  // --- dirty detection ---
  const isDirty = useMemo(
    () => snap(mapSlug, agentSlug, side, images, customFields, abilities) !== initialSnap,
    [mapSlug, agentSlug, side, images, customFields, abilities, initialSnap],
  );

  // --- validation ---
  const warnings = useMemo(() => {
    const w: string[] = [];
    if (!mapSlug) w.push("Map is required");
    if (!agentSlug) w.push("Agent is required");

    const title = (customFields["title"] ?? "").trim();
    if (!title) w.push("Title is required");
    else if (title.length > MAX_TEXT) w.push(`Title must be ${MAX_TEXT} characters or fewer`);

    const stance = customFields["stance"] ?? "";
    if (!stance) w.push("Stance is required");
    else if (!STANCE_PRESETS.includes(stance) && stance.length > MAX_TEXT)
      w.push(`Custom stance must be ${MAX_TEXT} characters or fewer`);

    if (images.length === 0) w.push("At least 1 image is required");

    const notes = customFields["notes"] ?? "";
    if (notes.length > MAX_TEXT) w.push(`Notes must be ${MAX_TEXT} characters or fewer`);

    return w;
  }, [mapSlug, agentSlug, customFields, images.length]);

  const isValid = warnings.length === 0;
  const canSubmit = isValid && !pending && (isEdit ? isDirty : true);

  function setCustom(key: string, val: string) {
    setCustomFields((c) => ({ ...c, [key]: val }));
  }

  // --- navigation guard ---
  function guardedNavigate(navigate: () => void) {
    if (isDirty) {
      pendingNavRef.current = navigate;
      setDiscardOpen(true);
    } else {
      navigate();
    }
  }

  function handleDiscard() {
    setDiscardOpen(false);
    pendingNavRef.current?.();
    pendingNavRef.current = null;
  }

  function handleBack() {
    guardedNavigate(() => {
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
      } else {
        router.push("/");
      }
    });
  }

  function handleCancel() {
    guardedNavigate(() => {
      router.push(cheatSheetHref({ mapSlug, agentSlug, side }));
    });
  }

  // --- upload ---
  async function uploadNewImages(): Promise<
    Array<{
      path: string;
      label?: string;
      text?: string;
      order: number;
      zoom_enabled?: boolean;
      zoom_x?: number;
      zoom_y?: number;
      crop_x?: number;
      crop_y?: number;
      crop_w?: number;
      crop_h?: number;
    }>
  > {
    const newOnes = images
      .map((img, i) => ({ img, i }))
      .filter(({ img }) => img.file);

    let slots: Array<{ path: string; token: string; signedUrl: string }> = [];
    if (newOnes.length > 0) {
      const res = await fetch("/api/images/sign-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: newOnes.length }),
      });
      if (!res.ok) throw new Error("Failed to get upload URLs");
      const j = (await res.json()) as { slots: typeof slots };
      slots = j.slots;
    }

    const supabase = getBrowserSupabase();
    const uploadedByIndex = new Map<number, string>();

    await Promise.all(
      newOnes.map(async ({ img, i }, k) => {
        const slot = slots[k];
        const file = img.file!;
        const compressed = await compressImage(file);
        const { error: upErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .uploadToSignedUrl(slot.path, slot.token, compressed, {
            contentType: "image/jpeg",
          });
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        uploadedByIndex.set(i, slot.path);
      }),
    );

    return images.map((img, i) => {
      const out: {
        path: string;
        label?: string;
        text?: string;
        order: number;
        zoom_enabled?: boolean;
        zoom_x?: number;
        zoom_y?: number;
        crop_x?: number;
        crop_y?: number;
        crop_w?: number;
        crop_h?: number;
      } = {
        path: img.existingPath ?? uploadedByIndex.get(i)!,
        label: img.label?.trim() || undefined,
        text: img.text?.trim() || undefined,
        order: i,
      };
      if (img.zoomEnabled === false) {
        out.zoom_enabled = false;
      } else {
        out.zoom_x = img.zoomX ?? 50;
        out.zoom_y = img.zoomY ?? 50;
      }
      if (img.customCrop) {
        out.crop_x = img.cropX ?? 0;
        out.crop_y = img.cropY ?? 0;
        out.crop_w = img.cropW ?? 100;
        out.crop_h = img.cropH ?? 100;
      }
      return out;
    });
  }

  // --- submit ---
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setPending(true);
    try {
      const finalImages = await uploadNewImages();
      const selectedAgent = agents.find((a) => a.slug === agentSlug);
      const finalAbilities = selectedAgent
        ? abilities.filter((k) => Boolean(selectedAgent.abilities[k]))
        : [];
      const payload = {
        map_slug: mapSlug,
        agent_slug: agentSlug,
        side,
        images: finalImages,
        custom_fields: customFields,
        abilities: finalAbilities,
      };
      const res = await fetch(
        isEdit ? `/api/lineups/${initial!.id}` : "/api/lineups",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Save failed");
      }
      const sp = new URLSearchParams();
      sp.set("map", mapSlug);
      sp.set("agent", agentSlug);
      sp.set("side", side);
      invalidateLineupCaches();
      router.push(`/?${sp.toString()}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setPending(false);
    }
  }

  // --- delete ---
  async function onDelete() {
    if (!initial?.id) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/lineups/${initial.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      const sp = new URLSearchParams();
      if (mapSlug) sp.set("map", mapSlug);
      if (agentSlug) sp.set("agent", agentSlug);
      sp.set("side", side);
      invalidateLineupCaches();
      router.push(`/?${sp.toString()}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setPending(false);
      setDeleteOpen(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">
          {isEdit ? "Edit lineup" : "Add lineup"}
        </h1>
        <button
          type="button"
          onClick={handleBack}
          className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FieldSelect
            label="Map"
            value={mapSlug}
            onChange={setMapSlug}
            options={maps.map((m) => ({ value: m.slug, label: m.name }))}
            placeholder="Pick a map"
          />
          <FieldSelect
            label="Agent"
            value={agentSlug}
            onChange={setAgentSlug}
            options={agents.map((a) => ({ value: a.slug, label: a.name }))}
            placeholder="Pick an agent"
          />
          <SideField value={side} onChange={setSide} />
        </div>

        <AbilityToggleField
          agent={agents.find((a) => a.slug === agentSlug)}
          value={abilities}
          onChange={setAbilities}
        />

        {(titleField || stanceField) && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {titleField && (
              <div>
                <Label className="mb-1 block text-sm">{titleField.label}</Label>
                <Input
                  value={customFields["title"] ?? ""}
                  onChange={(e) => setCustom("title", e.target.value)}
                  placeholder="Enter title"
                  className="h-9"
                />
              </div>
            )}
            {stanceField && (
              <StanceField
                label={stanceField.label}
                value={customFields["stance"] ?? ""}
                onChange={(v) => setCustom("stance", v)}
              />
            )}
          </div>
        )}

        <div>
          <Label className="mb-2 block">Images (max 5)</Label>
          <ImageInput value={images} onChange={setImages} />
        </div>

        {otherFields.length > 0 && (
          <div className="space-y-3">
            {otherFields.map((f) => (
              <div key={f.id}>
                <Label htmlFor={`f-${f.key}`} className="mb-1 block text-sm">
                  {f.label}
                  {f.key === "notes" ? " (optional)" : ""}
                </Label>
                {f.input_type === "textarea" ? (
                  <Textarea
                    id={`f-${f.key}`}
                    value={customFields[f.key] ?? ""}
                    onChange={(e) => setCustom(f.key, e.target.value)}
                    rows={3}
                  />
                ) : (
                  <Input
                    id={`f-${f.key}`}
                    value={customFields[f.key] ?? ""}
                    onChange={(e) => setCustom(f.key, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {warnings.length > 0 && !pending && (
          <div className="space-y-1">
            {warnings.map((w) => (
              <p key={w} className="text-sm text-amber-600 dark:text-amber-500">
                {w}
              </p>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={!canSubmit}>
            {pending
              ? "Saving…"
              : isEdit
                ? isDirty
                  ? "Save"
                  : "No changes"
                : "Create"}
          </Button>
          <button
            type="button"
            onClick={handleCancel}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <span className="ml-auto" />
          {isEdit && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
              disabled={pending}
            >
              Delete
            </Button>
          )}
        </div>
      </form>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
            <DialogDescription>
              You have unsaved changes that will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDiscardOpen(false);
                pendingNavRef.current = null;
              }}
            >
              Keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDiscard}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this lineup?</DialogTitle>
            <DialogDescription>
              This permanently removes the lineup and its images. Cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onDelete}
              disabled={pending}
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
}) {
  return (
    <div>
      <Label className="mb-1 block text-sm">{label}</Label>
      <Select
        items={options}
        value={value || null}
        onValueChange={(v) => onChange((v as string | null) ?? "")}
      >
        <SelectTrigger className="!h-9 w-full bg-card">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SideField({
  value,
  onChange,
}: {
  value: Side;
  onChange: (v: Side) => void;
}) {
  return (
    <div>
      <Label className="mb-1 block text-sm">Side</Label>
      <div className="flex h-9 rounded-lg border border-border overflow-hidden">
        {(["attack", "defense"] as Side[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            aria-pressed={value === s}
            className={
              "flex-1 text-sm transition-colors " +
              (value === s
                ? "bg-primary text-primary-foreground"
                : "bg-card hover:bg-muted")
            }
          >
            {s === "attack" ? "Attack" : "Defense"}
          </button>
        ))}
      </div>
    </div>
  );
}

function AbilityToggleField({
  agent,
  value,
  onChange,
}: {
  agent: Agent | undefined;
  value: AgentAbilityKey[];
  onChange: (v: AgentAbilityKey[]) => void;
}) {
  const slots = agent
    ? ABILITY_KEYS.filter((k) => Boolean(agent.abilities[k]))
    : [];
  const selected = new Set(value);

  function toggle(key: AgentAbilityKey) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(ABILITY_KEYS.filter((k) => next.has(k)));
  }

  return (
    <div>
      <Label className="mb-2 block text-sm">Abilities</Label>
      {!agent ? (
        <p className="text-sm text-muted-foreground">
          Pick an agent above to choose abilities.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {slots.map((key) => {
              const a = agent.abilities[key]!;
              const isOn = selected.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggle(key)}
                  aria-pressed={isOn}
                  title={a.name}
                  className={
                    "inline-flex h-14 w-14 items-center justify-center rounded-lg border-2 transition-all " +
                    (isOn
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card opacity-50 hover:opacity-80")
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.icon}
                    alt={a.name}
                    className="h-10 w-10 object-contain"
                  />
                </button>
              );
            })}
          </div>
          {value.length === 0 && (
            <p className="mt-2 text-sm text-amber-600 dark:text-amber-500">
              No abilities selected — this lineup won&apos;t show an ability
              icon on the cheat sheet.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function StanceField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const isPreset = STANCE_PRESETS.includes(value);
  const [useCustom, setUseCustom] = useState(!isPreset && value !== "");
  const [customText, setCustomText] = useState(!isPreset ? value : "");

  const selectValue = useCustom ? null : (value || null);

  function handleSelectChange(v: string) {
    if (v === "__custom__") {
      setUseCustom(true);
      onChange(customText);
    } else {
      setUseCustom(false);
      onChange(v);
    }
  }

  function handleCustomChange(v: string) {
    setCustomText(v);
    onChange(v);
  }

  return (
    <div>
      <Label className="mb-1 block text-sm">{label}</Label>
      <Select
        value={selectValue}
        onValueChange={(v) => handleSelectChange((v as string | null) ?? "")}
      >
        <SelectTrigger className="!h-9 w-full bg-card">
          <SelectValue placeholder={useCustom ? "Custom…" : "Pick a stance"} />
        </SelectTrigger>
        <SelectContent>
          {STANCE_PRESETS.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
          <SelectItem value="__custom__">Custom&hellip;</SelectItem>
        </SelectContent>
      </Select>
      {useCustom && (
        <Textarea
          className="mt-2 min-h-0 resize-none py-1"
          value={customText}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder="Enter custom stance"
          rows={1}
        />
      )}
    </div>
  );
}

function cheatSheetHref(f: {
  mapSlug?: string;
  agentSlug?: string;
  side: Side;
}) {
  const sp = new URLSearchParams();
  if (f.mapSlug) sp.set("map", f.mapSlug);
  if (f.agentSlug) sp.set("agent", f.agentSlug);
  sp.set("side", f.side);
  return `/?${sp.toString()}`;
}
