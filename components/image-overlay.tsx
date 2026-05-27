"use client";

import { useEffect, useState } from "react";

export function ImageOverlay({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  const [errored, setErrored] = useState(false);
  const [retrySeed, setRetrySeed] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  function retry() {
    setErrored(false);
    setRetrySeed((n) => n + 1);
  }

  // Append a cache-busting param on retry so the browser re-fetches.
  const imgSrc = retrySeed > 0 ? `${src}${src.includes("?") ? "&" : "?"}_r=${retrySeed}` : src;

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
    >
      {errored ? (
        <div
          className="flex flex-col items-center gap-3 text-white"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm text-white/70">Failed to load image</p>
          <button
            type="button"
            onClick={retry}
            className="rounded bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
          >
            Retry
          </button>
        </div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          key={retrySeed}
          src={imgSrc}
          alt={alt ?? ""}
          className="max-h-full max-w-full rounded shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          onError={() => setErrored(true)}
        />
      )}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20"
      >
        Close (Esc)
      </button>
    </div>
  );
}
