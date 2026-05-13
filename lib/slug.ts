// URL-safe slugs derived from map/agent names. Used in query params so the
// URL reads `?map=haven&agent=kayo` instead of two UUIDs. KAY/O's slash is
// stripped (KAY/O -> kayo).

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function indexBySlug<T extends { id: string; name: string }>(
  rows: T[],
): { bySlug: Map<string, T>; slugById: Map<string, string> } {
  const bySlug = new Map<string, T>();
  const slugById = new Map<string, string>();
  for (const r of rows) {
    const s = toSlug(r.name);
    bySlug.set(s, r);
    slugById.set(r.id, s);
  }
  return { bySlug, slugById };
}
