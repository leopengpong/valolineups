import Link from "next/link";
import { SettingsEditor } from "@/components/settings-editor";
import {
  getCachedAgents,
  getCachedFields,
  getCachedMaps,
} from "@/lib/data/reference";
import type { Agent, FieldDefinition, Map as MapRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let maps: MapRow[] = [];
  let agents: Agent[] = [];
  let fields: FieldDefinition[] = [];
  let loadError: string | null = null;
  try {
    [maps, agents, fields] = await Promise.all([
      getCachedMaps(),
      getCachedAgents(),
      getCachedFields(),
    ]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load settings";
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">Settings</h1>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Cheat sheet
        </Link>
      </div>
      {loadError && (
        <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <p className="font-medium text-destructive">Failed to load settings</p>
          <p className="mt-1 text-destructive/80">{loadError}</p>
          <p className="mt-2 text-muted-foreground">
            Check that <code>supabase/schema.sql</code> and{" "}
            <code>supabase/seed.sql</code> have both been run.
          </p>
        </div>
      )}
      <SettingsEditor maps={maps} agents={agents} fields={fields} />
    </main>
  );
}
