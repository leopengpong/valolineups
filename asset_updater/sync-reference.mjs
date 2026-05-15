// Sync map + agent reference data from valorant-api.com into the committed
// data files at lib/data/{agents,maps}.json, and download ability icons
// into public/agent-abilities/.
//
// Runs as `npm run build`'s prebuild step so each deploy picks up newly
// released agents/maps. On any API or write failure the script exits 0 (with
// a warning) so a deploy is never blocked by a transient outage — the
// existing committed files are the fallback.
//
// Can also be run by hand to refresh + commit:
//   node asset_updater/sync-reference.mjs
//
// Why this isn't a real DB writer: agents and maps are static reference data,
// not user-managed. The DB no longer has tables for them; lineups reference
// them by slug. See ARCHITECTURE.md "Reference data" for the full rationale.

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const AGENTS_JSON = join(REPO_ROOT, "lib", "data", "agents.json");
const MAPS_JSON = join(REPO_ROOT, "lib", "data", "maps.json");
const ICONS_DIR = join(REPO_ROOT, "public", "agent-abilities");
const ICON_URL_PREFIX = "/agent-abilities";

const AGENTS_API = "https://valorant-api.com/v1/agents?isPlayableCharacter=true";
const MAPS_API = "https://valorant-api.com/v1/maps";

// The API's "Grenade" slot is exposed as ability3 in our schema. "Passive" is
// ignored — most agents don't have one, and the ones that do aren't useful
// for the lineups cheat sheet.
const SLOT_TO_KEY = {
  Ability1: "ability1",
  Ability2: "ability2",
  Grenade: "ability3",
  Ultimate: "ultimate",
};

const SOFT_FAIL = process.argv.includes("--soft-fail");

function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fileExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json();
}

async function downloadIcon(url, dest) {
  if (await fileExists(dest)) return false;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return true;
}

async function syncAgents() {
  console.log(`Fetching ${AGENTS_API}`);
  const json = await fetchJson(AGENTS_API);
  const playable = (json.data ?? []).filter((a) => a.isPlayableCharacter);
  console.log(`  ${playable.length} playable agents from API`);

  await mkdir(ICONS_DIR, { recursive: true });

  // Sort by display name so the JSON diff stays human-readable.
  playable.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const rows = [];
  const KEY_ORDER = ["ability1", "ability2", "ability3", "ultimate"];
  for (const agent of playable) {
    const slug = toSlug(agent.displayName);
    const bySlot = {};
    for (const ability of agent.abilities ?? []) {
      const key = SLOT_TO_KEY[ability.slot];
      if (!key || !ability.displayIcon) continue;
      const filename = `${slug}-${key}.png`;
      const dest = join(ICONS_DIR, filename);
      const downloaded = await downloadIcon(ability.displayIcon, dest);
      if (downloaded) console.log(`    ↓ ${filename}`);
      bySlot[key] = {
        name: ability.displayName,
        icon: `${ICON_URL_PREFIX}/${filename}`,
      };
    }
    // Emit slots in canonical order so the JSON diff is stable across
    // agents — the API returns Brimstone's Grenade first, others' last.
    const abilities = {};
    for (const k of KEY_ORDER) if (bySlot[k]) abilities[k] = bySlot[k];
    rows.push({ slug, name: agent.displayName, abilities });
  }

  await writeJson(AGENTS_JSON, rows);
  console.log(`  wrote ${AGENTS_JSON} (${rows.length} agents)`);
}

async function syncMaps() {
  console.log(`Fetching ${MAPS_API}`);
  const json = await fetchJson(MAPS_API);
  // Real PvP maps have non-null `coordinates`. TDM maps, the Range, and
  // Skirmish dummies all have coordinates = null — that's the discriminator.
  const pvp = (json.data ?? []).filter(
    (m) => m.coordinates && m.displayIcon && m.displayName,
  );
  console.log(`  ${pvp.length} PvP maps from API`);

  const existing = (await readJson(MAPS_JSON)) ?? [];
  const rotationBySlug = new Map(
    existing.map((m) => [m.slug, Boolean(m.in_competitive_rotation)]),
  );
  const existingSlugs = new Set(existing.map((m) => m.slug));

  const merged = [];
  for (const m of pvp) {
    const slug = toSlug(m.displayName);
    merged.push({
      slug,
      name: m.displayName,
      // New maps default to in-rotation. Hand-edit to flag a map as
      // out-of-rotation (it'll appear muted in the matrix and be hidden
      // unless the "show out-of-rotation" checkbox is enabled).
      in_competitive_rotation: rotationBySlug.get(slug) ?? true,
    });
  }
  // Keep maps that exist in the committed file but were dropped from the API
  // response — historical maps a lineup might still reference. New deploys
  // shouldn't make those lineups inaccessible.
  for (const m of existing) {
    if (!merged.some((x) => x.slug === m.slug)) {
      merged.push(m);
      console.log(`  (kept legacy map: ${m.name})`);
    }
  }
  merged.sort((a, b) => a.name.localeCompare(b.name));

  await writeJson(MAPS_JSON, merged);
  const added = merged.filter((m) => !existingSlugs.has(m.slug));
  if (added.length > 0) {
    console.log(
      `  added ${added.length} new map(s): ${added.map((m) => m.name).join(", ")}`,
    );
  }
  console.log(`  wrote ${MAPS_JSON} (${merged.length} maps)`);
}

async function main() {
  await syncAgents();
  await syncMaps();
  console.log("Done.");
}

main().catch((err) => {
  if (SOFT_FAIL) {
    console.warn(
      `[sync-reference] WARN: ${err?.message ?? err}\n` +
        `  Continuing with committed data files.`,
    );
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});
