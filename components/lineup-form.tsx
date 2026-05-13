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
import { ImageInput, type ImageItem } from "@/components/image-input";
import { compressImage } from "@/lib/image";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { toSlug } from "@/lib/slug";
import { STORAGE_BUCKET } from "@/lib/types";
import type {
  Agent,
  FieldDefinition,
  Map as MapRow,
  Side,
} from "@/lib/types";

type InitialValue = {
  id?: string;
  mapId?: string;
  agentId?: string;
  side?: Side;
  images: ImageItem[];
  customFields: Record<string, string>;
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

  const [mapId, setMapId] = useState<string>(
    initial?.mapId ?? prefilledFilters?.map ?? "",
  );
  const [agentId, setAgentId] = useState<string>(
    initial?.agentId ?? prefilledFilters?.agent ?? "",
  );
  const [side, setSide] = useState<Side>(
    initial?.side ?? prefilledFilters?.side ?? "attack",
  );
  const [images, setImages] = useState<ImageItem[]>(initial?.images ?? []);
  const [customFields, setCustomFields] = useState<Record<string, string>>(
    initial?.customFields ?? {},
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function setCustom(key: string, val: string) {
    setCustomFields((c) => ({ ...c, [key]: val }));
  }

  async function uploadNewImages(): Promise<
    Array<{ path: string; label?: string; order: number }>
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

    return images.map((img, i) => ({
      path: img.existingPath ?? uploadedByIndex.get(i)!,
      label: img.label?.trim() || undefined,
      order: i,
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!mapId || !agentId) {
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
      const payload = {
        map_id: mapId,
        agent_id: agentId,
        side,
        images: finalImages,
        custom_fields: customFields,
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
      const mapName = maps.find((m) => m.id === mapId)?.name;
      const agentName = agents.find((a) => a.id === agentId)?.name;
      const sp = new URLSearchParams();
      if (mapName) sp.set("map", toSlug(mapName));
      if (agentName) sp.set("agent", toSlug(agentName));
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
      const mapName = maps.find((m) => m.id === mapId)?.name;
      const agentName = agents.find((a) => a.id === agentId)?.name;
      const sp = new URLSearchParams();
      if (mapName) sp.set("map", toSlug(mapName));
      if (agentName) sp.set("agent", toSlug(agentName));
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
          value={mapId}
          onChange={setMapId}
          options={maps.map((m) => ({ value: m.id, label: m.name }))}
          placeholder="Pick a map"
        />
        <FieldSelect
          label="Agent"
          value={agentId}
          onChange={setAgentId}
          options={agents.map((a) => ({ value: a.id, label: a.name }))}
          placeholder="Pick an agent"
        />
        <SideField value={side} onChange={setSide} />
      </div>

      <div>
        <Label className="mb-2 block">Images (max 3)</Label>
        <ImageInput value={images} onChange={setImages} />
      </div>

      {fields.length > 0 && (
        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.id}>
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
          href={cheatSheetHref({
            mapName: maps.find((m) => m.id === mapId)?.name,
            agentName: agents.find((a) => a.id === agentId)?.name,
            side,
          })}
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
  return (
    <div>
      <Label className="mb-1 block text-sm">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
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
                : "bg-background hover:bg-muted")
            }
          >
            {s === "attack" ? "Attack" : "Defense"}
          </button>
        ))}
      </div>
    </div>
  );
}

function cheatSheetHref(f: {
  mapName?: string;
  agentName?: string;
  side: Side;
}) {
  const sp = new URLSearchParams();
  if (f.mapName) sp.set("map", toSlug(f.mapName));
  if (f.agentName) sp.set("agent", toSlug(f.agentName));
  sp.set("side", f.side);
  return `/?${sp.toString()}`;
}
