"use client";

import { useRouter } from "next/navigation";

// router.back() returns to the previous URL with its query string intact —
// the right primitive for "← Back" inside this app, where the cheat sheet's
// filters live in the URL. The window.history.length guard handles the
// fresh-tab / deep-link case where there's nothing to go back to.
export function BackButton({
  fallbackHref = "/",
  className,
  children,
}: {
  fallbackHref?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      className={className}
    >
      {children}
    </button>
  );
}
