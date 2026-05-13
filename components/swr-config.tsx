"use client";

import { SWRConfig } from "swr";

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        // Revalidate when the user returns to a tab or when a stale cache hit
        // is reused — otherwise edits made on another device never appear
        // until SWR happens to refetch. Single-user app, so the extra reads
        // are fine.
        revalidateOnFocus: true,
        revalidateIfStale: true,
        revalidateOnReconnect: false,
        dedupingInterval: 60_000,
      }}
    >
      {children}
    </SWRConfig>
  );
}
