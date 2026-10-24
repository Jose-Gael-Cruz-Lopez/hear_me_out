// The tap questions every player answers, plus how each answer maps to a hard filter.

export const BUDGETS = [
  { value: 1, label: '$', hint: 'cheap eats' },
  { value: 2, label: '$$', hint: 'normal' },
  { value: 3, label: '$$$', hint: 'treat yourself' },
] as const;

export const DIETS = [
  { value: 'any', label: 'Anything', emoji: '🍽️' },
  { value: 'vegetarian', label: 'Vegetarian', emoji: '🥕' },
  { value: 'vegan', label: 'Vegan', emoji: '🌱' },
  { value: 'halal', label: 'Halal', emoji: '🥙' },
  { value: 'gluten-free', label: 'Gluten-free', emoji: '🌾' },
] as const;

export const DISTANCES = [
  { value: 'walk', label: 'Walkable', hint: '≤ 1.5 km', meters: 1500 },
  { value: 'short-ride', label: 'Short ride', hint: '≤ 5 km', meters: 5000 },
  { value: 'anywhere', label: 'Anywhere', hint: '≤ 15 km', meters: 15000 },
] as const;

export const FREE_SLOTS = [
  { value: 'now', label: 'Right now' },
  { value: 'tonight', label: 'Tonight' },
  { value: 'tomorrow-lunch', label: 'Tomorrow lunch' },
  { value: 'tomorrow-night', label: 'Tomorrow night' },
  { value: 'weekend', label: 'This weekend' },
] as const;

// Each vibe matches places whose category/name contains one of its keywords.
export const VIBES = [
  { value: 'tacos', label: 'Tacos & Mexican', emoji: '🌮', keywords: ['mexican', 'taco', 'burrito', 'taqueria'] },
  { value: 'pizza', label: 'Pizza & Italian', emoji: '🍕', keywords: ['pizza', 'italian', 'pasta'] },
  { value: 'asian', label: 'Noodles & Asian', emoji: '🍜', keywords: ['chinese', 'japanese', 'sushi', 'ramen', 'thai', 'vietnamese', 'korean', 'asian', 'dim sum', 'noodle', 'pho', 'indian'] },
  { value: 'burgers', label: 'Burgers & sandwiches', emoji: '🍔', keywords: ['burger', 'american', 'diner', 'sandwich', 'deli', 'grill'] },
  { value: 'healthy', label: 'Fresh & healthy', emoji: '🥗', keywords: ['salad', 'vegan', 'vegetarian', 'mediterranean', 'poke', 'healthy', 'greek'] },
  { value: 'sweet', label: 'Dessert, boba, coffee', emoji: '🧋', keywords: ['dessert', 'ice cream', 'bakery', 'boba', 'tea', 'cafe', 'coffee', 'donut', 'creamery', 'chocolate'] },
  { value: 'drinks', label: 'Drinks', emoji: '🍹', keywords: ['bar', 'pub', 'brewery', 'cocktail', 'wine', 'tavern'] },
  { value: 'active', label: 'Do something', emoji: '🎳', keywords: ['bowling', 'arcade', 'park', 'museum', 'golf', 'karaoke', 'escape', 'climbing', 'gallery', 'theater', 'cinema', 'pier', 'beach', 'game'] },
] as const;

export type Vibe = (typeof VIBES)[number]['value'];
export type Diet = (typeof DIETS)[number]['value'];
export type DistanceChoice = (typeof DISTANCES)[number]['value'];
export type FreeSlot = (typeof FREE_SLOTS)[number]['value'];

export const label = <T extends { value: unknown; label: string }>(list: readonly T[], v: unknown) =>
  list.find(x => x.value === v)?.label ?? String(v);

export function distanceMeters(d: string) {
  return DISTANCES.find(x => x.value === d)?.meters ?? 5000;
}

export function vibesFor(text: string): Vibe[] {
  const t = text.toLowerCase();
  return VIBES.filter(v => v.keywords.some(k => t.includes(k))).map(v => v.value);
}

export const DEFAULT_LOCATION = {
  label: 'Palace of Fine Arts, San Francisco',
  slug: 'palace-of-fine-arts',
  lat: 37.8029,
  lng: -122.4484,
};
