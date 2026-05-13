import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import { LineupForm } from "@/components/lineup-form";
import type {
  Agent,
  FieldDefinition,
  Map as MapRow,
  Side,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type SP = Promise<{ map?: string; agent?: string; side?: string }>;

export default async function AddPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const side: Side | undefined =
    sp.side === "defense" || sp.side === "attack" ? sp.side : undefined;

  const supabase = getServerSupabase();
  const [{ data: maps }, { data: agents }, { data: fields }] = await Promise.all([
    supabase.from("maps").select("id, name, sort_order").order("sort_order"),
    supabase.from("agents").select("id, name, sort_order").order("sort_order"),
    supabase
      .from("field_definitions")
      .select("id, key, label, input_type, sort_order")
      .order("sort_order"),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">Add lineup</h1>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Cheat sheet
        </Link>
      </div>
      <LineupForm
        maps={(maps ?? []) as MapRow[]}
        agents={(agents ?? []) as Agent[]}
        fields={(fields ?? []) as FieldDefinition[]}
        prefilledFilters={{ map: sp.map, agent: sp.agent, side }}
      />
    </main>
  );
}
