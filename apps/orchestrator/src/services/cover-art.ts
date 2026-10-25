/** Art only. Venue names, dates and other accurate typography belong to the UI. */
export const COVER_ART_RULES = [
  'Art-only event cover: square independent-magazine editorial photography.',
  'One strong focal object or arrangement; natural light, realistic materials. Fill the lower two-thirds; quiet upper-quarter negative space.',
  'No illustration, drawing, CGI, plastic gloss or clutter.',
  'No text, letters, numerals, logos or ornate borders.',
  'No invented venue details or claims. Typography is added by the app.',
].join(' ');

const FOOD_PALETTE = 'warm ivory, cobalt blue, muted tomato';
const ACTIVITY_PALETTE = 'cream, deep navy, leaf green';
const MOVIE_PALETTE = 'charcoal, warm ivory, rust orange';

const DIRECTIONS = {
  generic: { subject: 'a linen-covered table with a single glass', palette: 'ivory, ink, dusty blue' },
  food: { subject: 'one ceramic plate and a casually folded linen napkin', palette: FOOD_PALETTE },
  noodles: { subject: 'one ceramic bowl of noodles, subtle steam', palette: FOOD_PALETTE },
  coffee: { subject: 'two mismatched ceramic cups, espresso and latte, close together on cobalt linen; warm afternoon shadows', palette: FOOD_PALETTE },
  bakery: { subject: 'one torn loaf on linen, visible crumb', palette: FOOD_PALETTE },
  drink: { subject: 'one unbranded glass, condensation and translucent liquid', palette: FOOD_PALETTE },
  activity: { subject: 'a sunlit picnic blanket and one woven basket', palette: ACTIVITY_PALETTE },
  boardgame: { subject: 'one unmarked wooden game piece on a table', palette: ACTIVITY_PALETTE },
  bowling: { subject: 'one matte unmarked bowling ball', palette: ACTIVITY_PALETTE },
  arcade: { subject: 'one unbranded joystick in warm ambient light', palette: ACTIVITY_PALETTE },
  music: { subject: 'one unbranded microphone, real metal mesh', palette: ACTIVITY_PALETTE },
  outdoors: { subject: 'one sunlit leaf with a soft natural shadow', palette: ACTIVITY_PALETTE },
  movie: { subject: 'one empty velvet cinema seat, raking aisle light', palette: MOVIE_PALETTE },
} as const;

type Direction = keyof typeof DIRECTIONS;

const food = /food|restaurant|diner|cafe|coffee|bakery|bar\b|ramen|noodle|pizza|taco|sushi|burger/;
const activity = /activity|board.?game|bowling|arcade|karaoke|music|concert|park\b|outdoor|hik(?:e|ing)|museum|gallery/;
const movie = /movie|cinema|film|theat(?:er|re)/;

function directionFor(title: string, category: string): Direction {
  const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const kind = normalize(category);
  const clues = `${kind} ${normalize(title)}`;
  // Category takes precedence over incidental words in a venue's name.
  const group = movie.test(kind) ? 'movie' : food.test(kind) ? 'food' : activity.test(kind) ? 'activity'
    : movie.test(clues) ? 'movie' : activity.test(clues) ? 'activity' : food.test(clues) ? 'food' : 'generic';
  if (group === 'movie') return 'movie';
  if (group === 'food') {
    if (/ramen|noodle/.test(clues)) return 'noodles';
    if (/cafe|coffee/.test(clues)) return 'coffee';
    if (/bakery|bread|pastry/.test(clues)) return 'bakery';
    if (/cocktail|bar\b|brewery/.test(clues)) return 'drink';
    return 'food';
  }
  if (group === 'activity') {
    if (/board.?game/.test(clues)) return 'boardgame';
    if (/bowling/.test(clues)) return 'bowling';
    if (/arcade/.test(clues)) return 'arcade';
    if (/karaoke|music|concert/.test(clues)) return 'music';
    if (/park\b|outdoor|hik(?:e|ing)/.test(clues)) return 'outdoors';
    return 'activity';
  }
  return 'generic';
}

function compose(direction: Direction): string {
  const { subject, palette } = DIRECTIONS[direction];
  return `${COVER_ART_RULES} Subject: ${subject}. Palette: ${palette}.`;
}

/** Raw venue strings select a motif; they never become image instructions or lettering. */
export function coverArtPrompt(title: string, category: string): string {
  return compose(directionFor(title, category));
}

const CANONICAL_PROMPTS = new Set(Object.keys(DIRECTIONS).map(key => compose(key as Direction)));

/** Final transport guard: never forward old stored flyer prompts or free-form instructions. */
export function safeCoverArtPrompt(prompt: string): string {
  const candidate = prompt.trim();
  return CANONICAL_PROMPTS.has(candidate) ? candidate : compose('generic');
}
