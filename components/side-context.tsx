"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { Side } from "@/lib/types";

type Ctx = {
  side: Side;
  setSide: (next: Side) => void;
};

const SideCtx = createContext<Ctx | null>(null);

// Side lives in client state and syncs to `?side=` via history.replaceState.
// This avoids the RSC roundtrip that router.replace would force on a
// force-dynamic page, since side is purely a client-side memory filter.
export function SideProvider({
  initialSide,
  children,
}: {
  initialSide: Side;
  children: React.ReactNode;
}) {
  const [side, setSideState] = useState<Side>(initialSide);

  const setSide = useCallback((next: Side) => {
    setSideState(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("side", next);
    window.history.replaceState(null, "", url.toString());
  }, []);

  return (
    <SideCtx.Provider value={{ side, setSide }}>{children}</SideCtx.Provider>
  );
}

export function useSide(): Side {
  const ctx = useContext(SideCtx);
  if (!ctx) throw new Error("useSide must be used within SideProvider");
  return ctx.side;
}

export function useSetSide() {
  const ctx = useContext(SideCtx);
  if (!ctx) throw new Error("useSetSide must be used within SideProvider");
  return ctx.setSide;
}
