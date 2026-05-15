"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import Link from "next/link";
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

type InitialValue = {
  id?: string;
  mapSlug?: string;
  agentSlug?: string;
  side?: Side;
  images: ImageItem[];
  customFields: Record<string, string>;
  abilities?: AgentAbilityKey[];
};

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
  // New lineups default to ability1 selected. Edits use whatever was stored
  // (may be empty — the user can hit save with 0 selected, just gets a warning).
  const [abilities, setAbilities] = useState<AgentAbilityKey[]>(
    initial?.abilities ?? (initial?.id ? [] : ["ability1"]),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function setCustom(key: string, val: string) {
    setCustomFields((c) => ({ ...c, [key]: val }));
  }

  async function uploadNewImages(): Promise<
    Array<{
      path: string;
      label?: string;
      order: number;
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

    for (let k = 0; k < newOnes.length; k++) {
      const { img, i } = newOnes[k];
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
    }

    return images.map((img, i) => {
      const out: {
        path: string;
        label?: string;
        order: number;
        zoom_x?: number;
        zoom_y?: number;
        crop_x?: number;
        crop_y?: number;
        crop_w?: number;
        crop_h?: number;
      } = {
        path: img.existingPath ?? uploadedByIndex.get(i)!,
        label: img.label?.trim() || undefined,
        order: i,
      };
      if (img.customZoom) {
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!mapSlug || !agentSlug) {
      setError("Map and agent are required.");
      return;
    }
    if (images.length === 0) {
      setError("Add at least one image.");
      return;
    }
    setPending(true);
    try {
      const finalImages = await uploadNewImages();
      // Drop any selected slot that the chosen agent doesn't actually have —
      // can happen if the user switched agents mid-edit. The server also
      // re-validates against the legal slot set.
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

      <div>
        <Label className="mb-2 block">Images (max 3)</Label>
        <ImageInput value={images} onChange={setImages} />
      </div>

      {fields.length > 0 && (
        <div className="space-y-3">
          {fields
            // `ability` is no longer a custom field — it's the dedicated
            // <AbilityToggleField> above. Filter defensively in case the
            // 0004 migration hasn't run yet on this DB.
            .filter((f) => f.key !== "ability")
            .map((f) => (
            <div key={f.id}>
              {f.key === "stance" ? (
                <StanceField
                  label={f.label}
                  value={customFields[f.key] ?? ""}
                  onChange={(v) => setCustom(f.key, v)}
                />
              ) : (
                <>
                  <Label htmlFor={`f-${f.key}`} className="mb-1 block text-sm">
                    {f.label}
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
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save" : "Create"}
        </Button>
        <Link
          href={cheatSheetHref({ mapSlug, agentSlug, side })}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </Link>
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
    </form>
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
  // Use the base-ui Select primitive so the dropdown gets a consistent custom
  // UI cross-platform — the native <select> falls back to Times New Roman on
  // Windows. `null` sentinel makes the SelectValue render the placeholder.
  // `items` is required for SelectValue to render the label of the selected
  // option instead of its raw value (slug).
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
  // Only render toggles for slots the chosen agent actually has — Partial
  // <Record<AgentAbilityKey, AgentAbility>> in lib/types.ts. Iterating ABILITY_KEYS
  // (not Object.keys(agent.abilities)) guarantees canonical render order.
  const slots = agent
    ? ABILITY_KEYS.filter((k) => Boolean(agent.abilities[k]))
    : [];
  const selected = new Set(value);

  function toggle(key: AgentAbilityKey) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    // Persist in canonical order so the wire format and DB column agree.
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
              ⚠️ No abilities selected — this lineup won&apos;t show an ability
              icon on the cheat sheet.
            </p>
          )}
        </>
      )}
    </div>
  );
}

const STANCE_PRESETS = [
  "Standing",
  "Crouching",
  "Jumping",
  "Running",
  "Run + Jumping",
];

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

  const selectValue = useCustom ? "__custom__" : value;

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
        value={selectValue || null}
        onValueChange={(v) => handleSelectChange((v as string | null) ?? "")}
      >
        <SelectTrigger className="!h-9 w-full bg-card">
          <SelectValue placeholder="Pick a stance" />
        </SelectTrigger>
        <SelectContent>
          {STANCE_PRESETS.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
          <SelectItem value="__custom__">Custom…</SelectItem>
        </SelectContent>
      </Select>
      {useCustom && (
        <Input
          className="mt-2"
          value={customText}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder="Enter custom stance"
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
