"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Side } from "@/lib/types";

type Ctx = {
  side: Side;
  setSide: (next: Side) => void;
};

const SideCtx = createContext<Ctx | null>(null);

function readUrlSide(params: URLSearchParams | null): Side {
  return params?.get("side") === "defense" ? "defense" : "attack";
}

// SideProvider seeds its state from `?side=` via useSearchParams instead of a
// server-passed prop. That matters for back navigation: when setSide does a
// history.replaceState, Next copies the current entry's cached router tree
// onto the new history entry — so a prop-driven SideProvider would re-mount
// from that cached tree with the stale value. Reading the live URL here makes
// the cheat sheet's fresh mount on back always reflect the URL bar.
export function SideProvider({ children }: { children: React.ReactNode }) {
  const params = useSearchParams();
  const [side, setSideState] = useState<Side>(() => readUrlSide(params));

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
