"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import type { Agent, Map as MapRow } from "@/lib/types";

type NamedRow = { id: string; name: string; sort_order: number };

export function SettingsEditor({
  maps,
  agents,
}: {
  maps: MapRow[];
  agents: Agent[];
}) {
  return (
    <div className="space-y-10">
      <ChipsSection title="Maps" resource="maps" rows={maps} />
      <MapRotationSection maps={maps} />
      <ChipsSection title="Agents" resource="agents" rows={agents} />
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
