export function clampText(s: string, max: number): string {
  const trimmed = s.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/** Lowercase kebab-case, letters/digits only, at most 24 chars. Returns '' for junk. */
export function sanitizeTag(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
}

export function sanitizeTags(raw: readonly string[], max = 8): string[] {
  const out: string[] = [];
  for (const r of raw) {
    const tag = sanitizeTag(r);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

const DIETS = new Set(['vegan', 'vegetarian', 'gluten-free', 'halal', 'kosher', 'dairy-free', 'nut-free', 'pescatarian']);

export function sanitizeDiets(raw: readonly string[]): string[] {
  return sanitizeTags(raw, 8).filter(d => DIETS.has(d));
}

/** Top tags across the group, most common first. */
export function topTags(tagLists: readonly (readonly string[])[], max = 8): string[] {
  const counts = new Map<string, number>();
  for (const list of tagLists) for (const tag of list) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([tag]) => tag);
}
