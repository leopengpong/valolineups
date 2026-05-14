"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { blobToImageFile } from "@/lib/image";

export type ImageItem = {
  // For newly-added images.
  file?: File;
  previewUrl: string; // object URL for new files, signed URL for existing.
  // For existing images already in Storage.
  existingPath?: string;
  label?: string;
};

const MAX_IMAGES = 3;

export function ImageInput({
  value,
  onChange,
}: {
  value: ImageItem[];
  onChange: (next: ImageItem[]) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const remaining = MAX_IMAGES - value.length;

  const addFiles = useCallback(
    (files: File[]) => {
      const accepted = files
        .filter((f) => f.type.startsWith("image/"))
        .slice(0, remaining);
      if (accepted.length === 0) return;
      const next: ImageItem[] = [
        ...value,
        ...accepted.map((file) => ({
          file,
          previewUrl: URL.createObjectURL(file),
        })),
      ];
      onChange(next);
    },
    [onChange, remaining, value],
  );

  // Revoke object URLs we created.
  useEffect(() => {
    return () => {
      for (const item of value) {
        if (item.file && item.previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(item.previewUrl);
        }
      }
    };
    // intentionally only on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Paste handler.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (!e.clipboardData) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      const items = Array.from(e.clipboardData.items);
      const blobs: File[] = [];
      for (const it of items) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const blob = it.getAsFile();
          if (blob) blobs.push(blobToImageFile(blob, "pasted"));
        }
      }
      if (blobs.length > 0) {
        e.preventDefault();
        addFiles(blobs);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!e.dataTransfer) return;
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
  }

  function move(idx: number, delta: number) {
    const target = idx + delta;
    if (target < 0 || target >= value.length) return;
    const next = value.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }

  function remove(idx: number) {
    const item = value[idx];
    if (item.file && item.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(item.previewUrl);
    }
    const next = value.slice();
    next.splice(idx, 1);
    onChange(next);
  }

  function setLabel(idx: number, label: string) {
    const next = value.slice();
    next[idx] = { ...next[idx], label };
    onChange(next);
  }

  const dropZoneCls = useMemo(
    () =>
      [
        "rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors",
        dragOver
          ? "border-primary bg-primary/5 text-foreground"
          : "border-border text-muted-foreground hover:border-foreground/40",
      ].join(" "),
    [dragOver],
  );

  return (
    <div className="space-y-3">
      {value.length < MAX_IMAGES && (
        <div
          className={dropZoneCls}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <p>
            Paste (Ctrl/Cmd+V), drop, or click to add up to{" "}
            <strong>{remaining}</strong> more image{remaining === 1 ? "" : "s"}.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              addFiles(files);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {value.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {value.map((item, i) => (
            <li
              key={`${item.previewUrl}-${i}`}
              className="overflow-hidden rounded-lg border border-border bg-card p-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.previewUrl}
                alt={item.label || `image ${i + 1}`}
                className="aspect-video w-full rounded object-cover"
              />
              <Input
                value={item.label ?? ""}
                onChange={(e) => setLabel(i, e.target.value)}
                placeholder="Label (optional)"
                className="mt-2 h-7"
              />
              <div className="mt-2 flex items-center gap-1 text-xs">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                >
                  ←
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => move(i, 1)}
                  disabled={i === value.length - 1}
                >
                  →
                </Button>
                <span className="ml-auto" />
                <Button
                  type="button"
                  size="xs"
                  variant="destructive"
                  onClick={() => remove(i)}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
