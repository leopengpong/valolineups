"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Agent, FieldDefinition, Map as MapRow } from "@/lib/types";

type NamedRow = { id: string; name: string; sort_order: number };

export function SettingsEditor({
  maps,
  agents,
  fields,
}: {
  maps: MapRow[];
  agents: Agent[];
  fields: FieldDefinition[];
}) {
  return (
    <div className="space-y-10">
      <ChipsSection title="Maps" resource="maps" rows={maps} />
      <MapRotationSection maps={maps} />
      <ChipsSection title="Agents" resource="agents" rows={agents} />
      <FieldsSection rows={fields} />
    </div>
  );
}

// ─── Maps / Agents ──────────────────────────────────────────────────────────

function ChipsSection({
  title,
  resource,
  rows,
}: {
  title: string;
  resource: "maps" | "agents";
  rows: NamedRow[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<NamedRow[]>(rows);
  const [lastRows, setLastRows] = useState<NamedRow[]>(rows);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<NamedRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NamedRow | null>(null);

  // Re-sync to server-provided rows when they change (e.g. router.refresh()).
  // Allowed setState-during-render pattern.
  if (rows !== lastRows) {
    setLastRows(rows);
    setItems(rows);
  }

  async function add() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setAddError(null);
    try {
      const res = await fetch(`/api/${resource}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setAddError(j.error || `HTTP ${res.status}`);
        return;
      }
      const created = (await res.json()) as NamedRow;
      setItems((curr) => [...curr, created]);
      setNewName("");
      router.refresh();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  async function doRename(next: string): Promise<string | null> {
    if (!renameTarget) return "No target";
    const trimmed = next.trim();
    if (!trimmed) return "Name required";
    if (trimmed === renameTarget.name) return null; // no-op
    const res = await fetch(`/api/${resource}/${renameTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return j.error || `HTTP ${res.status}`;
    }
    setItems((curr) =>
      curr.map((r) => (r.id === renameTarget.id ? { ...r, name: trimmed } : r)),
    );
    router.refresh();
    return null;
  }

  async function doDelete(): Promise<
    { ok: true } | { ok: false; error?: string; usedBy?: number }
  > {
    if (!deleteTarget) return { ok: false, error: "No target" };
    const res = await fetch(`/api/${resource}/${deleteTarget.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setItems((curr) => curr.filter((r) => r.id !== deleteTarget.id));
      router.refresh();
      return { ok: true };
    }
    if (res.status === 409) {
      const j = (await res.json().catch(() => ({}))) as { count?: number };
      return { ok: false, usedBy: j.count ?? 0 };
    }
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: j.error || `HTTP ${res.status}` };
  }

  const singular = title.toLowerCase().replace(/s$/, "");

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      <div className="rounded-lg border border-border bg-card/30 p-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {items.map((row) => (
              <li key={row.id}>
                <Chip
                  label={row.name}
                  onRename={() => setRenameTarget(row)}
                  onDelete={() => setDeleteTarget(row)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Input
          value={newName}
          onChange={(e) => {
            setNewName(e.target.value);
            if (addError) setAddError(null);
          }}
          placeholder={`Add new ${singular}`}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" onClick={add} disabled={busy || !newName.trim()}>
          Add
        </Button>
      </div>
      {addError && <p className="mt-2 text-sm text-destructive">{addError}</p>}

      <RenameDialog
        target={renameTarget}
        title={`Rename ${singular}`}
        onClose={() => setRenameTarget(null)}
        onSave={doRename}
      />

      <DeleteDialog
        target={deleteTarget}
        title={`Delete ${singular}`}
        bodyHint={
          <>
            Type{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              {deleteTarget?.name}
            </code>{" "}
            below to confirm. This can&rsquo;t be undone.
          </>
        }
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
        renderBlocked={(usedBy) => (
          <p className="text-sm">
            Used by {usedBy} lineup{usedBy === 1 ? "" : "s"} — reassign or
            remove those first.
          </p>
        )}
      />
    </section>
  );
}

function Chip({
  label,
  onRename,
  onDelete,
}: {
  label: string;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background pl-3 pr-1 py-0.5 text-sm">
      <button
        type="button"
        onClick={onRename}
        className="rounded py-0.5 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        title={`Rename ${label}`}
      >
        {label}
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${label}`}
        title={`Delete ${label}`}
        className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
      >
        ×
      </button>
    </span>
  );
}

// ─── Competitive rotation ────────────────────────────────────────────────────

function MapRotationSection({ maps }: { maps: MapRow[] }) {
  const router = useRouter();
  const [inRotation, setInRotation] = useState<MapRow[]>(
    maps.filter((m) => m.in_competitive_rotation),
  );
  const [outRotation, setOutRotation] = useState<MapRow[]>(
    maps.filter((m) => !m.in_competitive_rotation),
  );
  const [lastMaps, setLastMaps] = useState(maps);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<"in" | "out" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (maps !== lastMaps) {
    setLastMaps(maps);
    setInRotation(maps.filter((m) => m.in_competitive_rotation));
    setOutRotation(maps.filter((m) => !m.in_competitive_rotation));
  }

  const isDirty = maps.some((m) => {
    const nowIn = inRotation.some((r) => r.id === m.id);
    return nowIn !== m.in_competitive_rotation;
  });

  function moveTo(id: string, to: "in" | "out") {
    const map = [...inRotation, ...outRotation].find((m) => m.id === id);
    if (!map) return;
    if (to === "in") {
      setInRotation((curr) =>
        curr.some((m) => m.id === id) ? curr : [...curr, map],
      );
      setOutRotation((curr) => curr.filter((m) => m.id !== id));
    } else {
      setOutRotation((curr) =>
        curr.some((m) => m.id === id) ? curr : [...curr, map],
      );
      setInRotation((curr) => curr.filter((m) => m.id !== id));
    }
  }

  function handleDrop(to: "in" | "out") {
    if (dragId) moveTo(dragId, to);
    setDragId(null);
    setDragOver(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const changed = maps.filter((m) => {
        const nowIn = inRotation.some((r) => r.id === m.id);
        return nowIn !== m.in_competitive_rotation;
      });
      for (const m of changed) {
        const nowIn = inRotation.some((r) => r.id === m.id);
        const res = await fetch(`/api/maps/${m.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ in_competitive_rotation: nowIn }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setError(j.error || `HTTP ${res.status}`);
          return;
        }
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Competitive rotation</h2>
      <div className="grid grid-cols-2 gap-3">
        <RotationBucket
          label="In rotation"
          items={inRotation}
          isOver={dragOver === "in"}
          onDragStart={(id) => setDragId(id)}
          onDragOver={() => setDragOver("in")}
          onDragLeave={() => setDragOver(null)}
          onDrop={() => handleDrop("in")}
        />
        <RotationBucket
          label="Out of rotation"
          items={outRotation}
          isOver={dragOver === "out"}
          onDragStart={(id) => setDragId(id)}
          onDragOver={() => setDragOver("out")}
          onDragLeave={() => setDragOver(null)}
          onDrop={() => handleDrop("out")}
        />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button type="button" onClick={save} disabled={busy || !isDirty}>
          {busy ? "Saving…" : "Save rotation"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </section>
  );
}

function RotationBucket({
  label,
  items,
  isOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  label: string;
  items: MapRow[];
  isOver: boolean;
  onDragStart: (id: string) => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      <div
        className={[
          "min-h-16 rounded-lg border p-2 transition-colors",
          isOver ? "border-primary/60 bg-primary/5" : "border-border bg-card/30",
        ].join(" ")}
        onDragOver={(e) => {
          e.preventDefault();
          onDragOver();
        }}
        onDragLeave={onDragLeave}
        onDrop={(e) => {
          e.preventDefault();
          onDrop();
        }}
      >
        {items.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">Drop maps here</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {items.map((m) => (
              <li key={m.id}>
                <span
                  draggable
                  onDragStart={() => onDragStart(m.id)}
                  className="inline-flex cursor-grab select-none items-center rounded-full border border-border bg-background px-3 py-0.5 text-sm active:cursor-grabbing"
                >
                  {m.name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Custom fields ──────────────────────────────────────────────────────────

function FieldsSection({ rows }: { rows: FieldDefinition[] }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [items, setItems] = useState<FieldDefinition[]>(rows);
  const [lastRows, setLastRows] = useState<FieldDefinition[]>(rows);
  const [newLabel, setNewLabel] = useState("");
  const [newMultiline, setNewMultiline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<FieldDefinition | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<
    (FieldDefinition & { count: number }) | null
  >(null);

  if (rows !== lastRows) {
    setLastRows(rows);
    setItems(rows);
  }

  function labelToKey(label: string) {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^[0-9]/, "_$&");
  }

  async function add() {
    const label = newLabel.trim();
    const key = labelToKey(label);
    if (!label || !key) return;
    setBusy(true);
    setAddError(null);
    try {
      const res = await fetch("/api/fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          key,
          input_type: newMultiline ? "textarea" : "text",
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setAddError(j.error || `HTTP ${res.status}`);
        return;
      }
      const created = (await res.json()) as FieldDefinition;
      setItems((curr) => [...curr, created]);
      setNewLabel("");
      setNewMultiline(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function doRename(next: string): Promise<string | null> {
    if (!renameTarget) return "No target";
    const trimmed = next.trim();
    if (!trimmed) return "Label required";
    if (trimmed === renameTarget.label) return null;
    const res = await fetch(`/api/fields/${renameTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: trimmed }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return j.error || `HTTP ${res.status}`;
    }
    setItems((curr) =>
      curr.map((r) =>
        r.id === renameTarget.id ? { ...r, label: trimmed } : r,
      ),
    );
    router.refresh();
    return null;
  }

  async function move(idx: number, delta: number) {
    const target = idx + delta;
    if (target < 0 || target >= items.length) return;
    const next = items.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    const order = next.map((r, i) => ({ id: r.id, sort_order: (i + 1) * 10 }));
    setItems(next.map((r, i) => ({ ...r, sort_order: order[i].sort_order })));
    await fetch("/api/fields", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    });
    router.refresh();
  }

  async function startDelete(row: FieldDefinition) {
    const res = await fetch(`/api/fields/${row.id}`);
    const j = (await res.json().catch(() => ({ count: 0 }))) as {
      count: number;
    };
    setDeleteTarget({ ...row, count: j.count });
  }

  async function doDelete(): Promise<
    { ok: true } | { ok: false; error?: string }
  > {
    if (!deleteTarget) return { ok: false, error: "No target" };
    const res = await fetch(`/api/fields/${deleteTarget.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: j.error || `HTTP ${res.status}` };
    }
    setItems((curr) => curr.filter((r) => r.id !== deleteTarget.id));
    // Field DELETE strips the key from every lineup's custom_fields, so any
    // cached lineups are now stale.
    mutate(
      (key) => Array.isArray(key) && key[0] === "lineups",
      undefined,
      { revalidate: true },
    );
    router.refresh();
    return { ok: true };
  }

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Custom fields</h2>
      <ul className="space-y-1 rounded-lg border border-border bg-card/30 p-2">
        {items.map((row, i) => (
          <li key={row.id} className="flex items-center gap-2 px-1">
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label="Move up"
            >
              ↑
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={() => move(i, 1)}
              disabled={i === items.length - 1}
              aria-label="Move down"
            >
              ↓
            </Button>
            <div className="flex flex-1 items-baseline gap-2">
              <span className="text-sm">{row.label}</span>
              <span className="text-xs text-muted-foreground">
                {row.key}
                {row.input_type === "textarea" ? " · multiline" : ""}
              </span>
            </div>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => setRenameTarget(row)}
            >
              Edit
            </Button>
            <Button
              type="button"
              size="xs"
              variant="destructive"
              onClick={() => startDelete(row)}
            >
              Delete
            </Button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="px-2 py-2 text-sm text-muted-foreground">None yet.</li>
        )}
      </ul>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <Label className="text-xs">Label</Label>
          <Input
            value={newLabel}
            onChange={(e) => {
              setNewLabel(e.target.value);
              if (addError) setAddError(null);
            }}
            placeholder="e.g. Ability"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          {newLabel.trim() && (
            <p className="mt-1 text-xs text-muted-foreground">
              key: <code>{labelToKey(newLabel) || "—"}</code>
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={newMultiline}
            onChange={(e) => setNewMultiline(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Multiline
        </label>
        <Button
          type="button"
          onClick={add}
          disabled={busy || !newLabel.trim() || !labelToKey(newLabel.trim())}
        >
          Add
        </Button>
      </div>
      {addError && <p className="mt-2 text-sm text-destructive">{addError}</p>}

      <RenameDialog
        target={
          renameTarget
            ? { id: renameTarget.id, name: renameTarget.label }
            : null
        }
        title="Rename field label"
        onClose={() => setRenameTarget(null)}
        onSave={doRename}
        inputLabel="Label"
      />

      <DeleteDialog
        target={
          deleteTarget
            ? { id: deleteTarget.id, name: deleteTarget.label }
            : null
        }
        title={`Delete custom field`}
        bodyHint={
          <>
            This will permanently remove &ldquo;{deleteTarget?.label}&rdquo;
            data from all {deleteTarget?.count ?? 0} lineup
            {deleteTarget?.count === 1 ? "" : "s"}. Type{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              {deleteTarget?.label}
            </code>{" "}
            below to confirm.
          </>
        }
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
      />
    </section>
  );
}

// ─── Reusable Rename / Delete dialogs ───────────────────────────────────────

function RenameDialog({
  target,
  title,
  inputLabel = "Name",
  onClose,
  onSave,
}: {
  target: { id: string; name: string } | null;
  title: string;
  inputLabel?: string;
  onClose: () => void;
  onSave: (next: string) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState(target?.name ?? "");
  const [lastTarget, setLastTarget] = useState(target);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (target !== lastTarget) {
    setLastTarget(target);
    setDraft(target?.name ?? "");
    setErr(null);
  }

  const open = Boolean(target);
  const unchanged = draft.trim() === (target?.name ?? "");
  const empty = draft.trim() === "";

  async function save() {
    setBusy(true);
    setErr(null);
    const result = await onSave(draft);
    setBusy(false);
    if (result === null) {
      onClose();
    } else {
      setErr(result);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Editing &ldquo;{target?.name}&rdquo;.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs" htmlFor="rename-input">
            {inputLabel}
          </Label>
          <Input
            id="rename-input"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (err) setErr(null);
            }}
            disabled={busy}
            autoFocus
          />
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={busy || empty || unchanged}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  target,
  title,
  bodyHint,
  onClose,
  onConfirm,
  renderBlocked,
}: {
  target: { id: string; name: string } | null;
  title: string;
  bodyHint: React.ReactNode;
  onClose: () => void;
  onConfirm: () => Promise<
    { ok: true } | { ok: false; error?: string; usedBy?: number }
  >;
  renderBlocked?: (usedBy: number) => React.ReactNode;
}) {
  const [typed, setTyped] = useState("");
  const [lastTarget, setLastTarget] = useState(target);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<number | null>(null);

  if (target !== lastTarget) {
    setLastTarget(target);
    setTyped("");
    setErr(null);
    setBlocked(null);
  }

  const open = Boolean(target);
  const matches = target ? typed === target.name : false;

  async function confirm() {
    setBusy(true);
    setErr(null);
    const result = await onConfirm();
    setBusy(false);
    if (result.ok) {
      onClose();
      return;
    }
    if (result.usedBy !== undefined && renderBlocked) {
      setBlocked(result.usedBy);
      return;
    }
    setErr(result.error || "Delete failed");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{bodyHint}</DialogDescription>
        </DialogHeader>
        {blocked !== null && renderBlocked ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
            {renderBlocked(blocked)}
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
                if (err) setErr(null);
              }}
              placeholder={target?.name ?? ""}
              disabled={busy}
              autoFocus
            />
            {err && <p className="text-sm text-destructive">{err}</p>}
          </div>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={busy}
          >
            {blocked !== null ? "Close" : "Cancel"}
          </Button>
          {blocked === null && (
            <Button
              type="button"
              variant="destructive"
              onClick={confirm}
              disabled={busy || !matches}
            >
              {busy ? "Deleting…" : "Delete"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
