// Menu check: find real dishes on a venue's own website that fit a diet, from crawled page text.

/** Menu markers ("(V)", "(GF)") and words, per diet. Pescatarian looks for seafood dishes. */
const MENU_MARKS: Record<string, RegExp> = {
  vegan: /\((?:vg|ve|vegan)\)|\bvegan\b|\bplant[- ]based\b/i,
  vegetarian: /\((?:v|vg|veg|vegetarian)\)|\bvegetarian\b|\bveggie\b|\bvegan\b|\bplant[- ]based\b/i,
  'gluten-free': /\(gf\)|\bgluten[- ]?free\b/i,
  halal: /\bhalal\b/i,
  kosher: /\bkosher\b/i,
  'dairy-free': /\(df\)|\bdairy[- ]?free\b|\bvegan\b/i,
  'nut-free': /\bnut[- ]?free\b/i,
  pescatarian: /\b(?:fish|salmon|tuna|shrimp|prawns?|sushi|sashimi|seafood|crab|scallops?|cod|halibut|oysters?)\b/i,
};

/** Site chrome and legal text that mentions a diet word without being food. */
const NOISE = /cookie|privacy|subscribe|newsletter|©|copyright|gift card|careers?|sign up|log ?in|terms|accessibility|allergen (?:policy|statement)|cross[- ]contact|cannot guarantee/i;

export interface MenuPage {
  url: string;
  text: string;
}

export interface MenuEvidence {
  /** Up to 4 short lines from the menu, e.g. "Tofu Larb (V)", "Vegan Pad See Ew". */
  dishes: string[];
  /** The page they came from ('' when nothing was found). */
  url: string;
}

/** A menu key like "(V) vegetarian (VG) vegan (GF) gluten free" explains markers; it isn't a dish. */
function isLegend(line: string): boolean {
  const parenMarks = (line.match(/\([a-z]{1,3}\)/gi) ?? []).length;
  const keyMarks = (line.match(/\b[a-z]{1,3}\s*[|=]\s*(?:vegan|vegetarian|gluten|dairy)/gi) ?? []).length;
  return parenMarks >= 2 || keyMarks >= 2 || (keyMarks === 1 && line.length <= 40) || /^(?:dietary )?(?:key|legend)\b/i.test(line);
}

/** A section heading like "Vegan" or "Vegetarian Options" names a diet, not a dish. */
function isHeading(line: string): boolean {
  return /^(?:(?:vegan|vegetarian|veggie|gluten[- ]?free|halal|kosher|dairy[- ]?free|plant[- ]based|options?|menu|dishes|&|and)\s*)+$/i.test(line);
}

/** "Fresh spinach, tofu, herbs (can be vegan)" is a description; its dish name is usually the line above. */
function isDescription(line: string): boolean {
  const firstComma = line.split(',')[0]!.trim().split(/\s+/).length;
  const listy = line.includes(',') && firstComma <= 4;
  const sentence = /\.\s|\.$|\(can be/i.test(line);
  return line.split(/\s+/).length > 4 && (listy || sentence) && !/\s[-–—]\s|:/.test(line) && !/[!?]$/.test(line);
}

/** A dish name: short, Title Case (not an ALL-CAPS section heading), no sentence punctuation or price. */
function isTitle(line: string): boolean {
  return line.length > 0 && line.length <= 40 && line.split(/\s+/).length <= 6 && line !== line.toUpperCase() && !/[.,!?]$/.test(line) && !/\$\s?\d/.test(line);
}

/** True when `dish` really appears in the crawled text (guards against an AI inventing dishes). */
export function appearsIn(pages: readonly MenuPage[], dish: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const d = norm(dish);
  return d.length >= 3 && pages.some(p => norm(p.text).includes(d));
}

function clean(line: string): string {
  return line
    .replace(/\s+/g, ' ')
    .replace(/\s*\$\s?\d+(?:\.\d{2})?\s*$/, '') // trailing price
    .replace(/^[\s•·\-–—*|]+|[\s•·\-–—*|:]+$/g, '')
    .trim();
}

/** How menu-like a matching line is: short, has a price or a marker in parentheses. Lower is better. */
function rank(raw: string, line: string): number {
  let score = line.length;
  if (/\$\s?\d/.test(raw)) score -= 40;
  if (/\([a-z]{1,3}\)/i.test(raw)) score -= 25;
  if (/\b(?:options?|available|ask|can be made|upon request)\b/i.test(line)) score += 30;
  return score;
}

/** Real dishes that fit `diet`, from the crawled pages; prefers a page whose URL says "menu". */
export function menuEvidence(pages: readonly MenuPage[], diet: string): MenuEvidence {
  const mark = MENU_MARKS[diet];
  if (!mark) return { dishes: [], url: '' };
  let best: MenuEvidence = { dishes: [], url: '' };
  let bestScore = -1;
  for (const page of pages) {
    const found = new Map<string, number>();
    let prev = '';
    for (const raw of page.text.split(/\r?\n|(?<=\.)\s+(?=[A-Z])/)) {
      let line = clean(raw);
      const title = prev;
      if (line) prev = line;
      if (line.length < 3 || line.length > 120 || !mark.test(raw) || NOISE.test(line) || isLegend(line) || isHeading(line)) continue;
      if (isDescription(line) && isTitle(title) && !mark.test(title)) line = `${title}: ${line}`.slice(0, 120);
      if (![...found.keys()].some(k => k.toLowerCase() === line.toLowerCase())) found.set(line, rank(raw, line));
    }
    if (found.size === 0) continue;
    const dishes = [...found.entries()].sort((a, b) => a[1] - b[1]).map(([l]) => l).slice(0, 4);
    const score = found.size + (/menu/i.test(page.url) ? 5 : 0);
    if (score > bestScore) {
      best = { dishes, url: page.url };
      bestScore = score;
    }
  }
  return best;
}

export const MENU_DIETS = Object.keys(MENU_MARKS);
