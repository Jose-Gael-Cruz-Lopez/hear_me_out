/** Art only. Venue names, dates and other accurate typography belong to the UI. */
export const COVER_ART_RULES = [
  'Art-only event cover: square contemporary editorial still life.',
  'One strong focal object; tactile still life, soft directional light, subtle grain.',
  'Clean upper-third negative space. Use only the specified palette.',
  'No text, letters, numerals, logos, ornate borders, confetti, collage or cuisine stereotypes.',
  'No invented venue details or claims. The app adds all venue and time typography.',
].join(' ');

const FOOD_PALETTE = 'warm ivory, espresso, muted tomato';
const ACTIVITY_PALETTE = 'cream, deep navy, leaf green';
const MOVIE_PALETTE = 'charcoal, warm ivory, rust orange';

const DIRECTIONS = {
  generic: { subject: 'one folded paper loop', palette: 'paper, ink, dusty blue' },
  food: { subject: 'one ceramic plate with a single abstract food form', palette: FOOD_PALETTE },
  noodles: { subject: 'one ceramic bowl with a flowing noodle form', palette: FOOD_PALETTE },
  coffee: { subject: 'one unbranded ceramic coffee cup', palette: FOOD_PALETTE },
  bakery: { subject: 'one sculptural folded bread form', palette: FOOD_PALETTE },
  drink: { subject: 'one unbranded glass with a translucent liquid form', palette: FOOD_PALETTE },
  activity: { subject: 'one folded paper sculpture', palette: ACTIVITY_PALETTE },
  boardgame: { subject: 'one oversized unmarked wooden game piece', palette: ACTIVITY_PALETTE },
  bowling: { subject: 'one matte unmarked bowling ball', palette: ACTIVITY_PALETTE },
  arcade: { subject: 'one unbranded sculptural joystick', palette: ACTIVITY_PALETTE },
  music: { subject: 'one unbranded sculptural microphone', palette: ACTIVITY_PALETTE },
  outdoors: { subject: 'one sculptural leaf', palette: ACTIVITY_PALETTE },
  movie: { subject: 'one unmarked sculptural cinema seat', palette: MOVIE_PALETTE },
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
