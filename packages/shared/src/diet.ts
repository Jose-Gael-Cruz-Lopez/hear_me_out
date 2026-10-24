import type { Venue } from './venue';

const DIET_PATTERNS: Record<string, { label: string; re: RegExp }> = {
  vegan: { label: 'Vegan', re: /\bvegan\b|plant[- ]based/i },
  vegetarian: { label: 'Vegetarian', re: /\bvegetarian\b|\bveggie\b|\bvegan\b|plant[- ]based/i },
  'gluten-free': { label: 'Gluten-free', re: /gluten[- ]?free|\bceliac\b/i },
  halal: { label: 'Halal', re: /\bhalal\b/i },
  kosher: { label: 'Kosher', re: /\bkosher\b/i },
  'dairy-free': { label: 'Dairy-free', re: /dairy[- ]?free|\bvegan\b|lactose[- ]free/i },
  'nut-free': { label: 'Nut-free', re: /nut[- ]?free|allerg(y|ies) friendly/i },
  pescatarian: { label: 'Pescatarian', re: /\bseafood\b|\bfish\b|\bsushi\b|\bvegetarian\b/i },
};

export interface DietEvidence {
  diet: string;
  confirmed: boolean;
  /** Where the evidence came from, phrased for the UI. */
  note: string;
}

/** Look for evidence that a venue serves a dietary need, in Google's facts first, then categories, then reviews. */
export function dietEvidence(v: Venue, diet: string, isFood: boolean): DietEvidence {
  const pattern = DIET_PATTERNS[diet];
  if (!pattern) return { diet, confirmed: true, note: '' };
  if (!isFood) return { diet, confirmed: true, note: '' };
  const fact = v.offerings.find(o => pattern.re.test(o));
  if (fact) return { diet, confirmed: true, note: `Google lists "${fact}"` };
  const cat = [v.category, ...v.categories, v.title].find(c => pattern.re.test(c));
  if (cat) return { diet, confirmed: true, note: `${pattern.label}: "${cat}"` };
  const review = v.reviewSnippets.find(r => pattern.re.test(r));
  if (review) return { diet, confirmed: true, note: `${pattern.label} options mentioned in reviews` };
  return { diet, confirmed: false, note: `Couldn't confirm ${pattern.label.toLowerCase()} options. Check the menu.` };
}

export const KNOWN_DIETS = Object.keys(DIET_PATTERNS);
