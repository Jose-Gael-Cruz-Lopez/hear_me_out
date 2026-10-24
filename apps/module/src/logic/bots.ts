export interface BotPreset {
  name: string;
  avatar: string;
  tags: string[];
  budgetMax: number;
  dietary: string[];
  maxTravelMin: number;
  /** Minutes from local midnight. */
  availability: { startMin: number; endMin: number }[];
}

// Bots are labeled as bots everywhere in the UI. Their profiles are fixed so runs are reproducible.
export const BOT_PRESETS: readonly BotPreset[] = [
  {
    name: 'Botley',
    avatar: '🤖',
    tags: ['spicy-food', 'karaoke', 'night-owl', 'cheap-eats'],
    budgetMax: 2,
    dietary: [],
    maxTravelMin: 25,
    availability: [{ startMin: 19 * 60, endMin: 23 * 60 }],
  },
  {
    name: 'Sprocket',
    avatar: '🦾',
    tags: ['vegan', 'board-games', 'cozy-spots', 'dessert'],
    budgetMax: 3,
    dietary: ['vegan'],
    maxTravelMin: 20,
    availability: [{ startMin: 18 * 60, endMin: 22 * 60 }],
  },
  {
    name: 'Widget',
    avatar: '👾',
    tags: ['ramen', 'anime', 'arcades', 'late-night'],
    budgetMax: 2,
    dietary: [],
    maxTravelMin: 30,
    availability: [{ startMin: 19 * 60 + 30, endMin: 24 * 60 }],
  },
  {
    name: 'Gizmo',
    avatar: '🛸',
    tags: ['tacos', 'live-music', 'outdoors', 'craft-beer'],
    budgetMax: 3,
    dietary: ['gluten-free'],
    maxTravelMin: 25,
    availability: [{ startMin: 18 * 60 + 30, endMin: 23 * 60 }],
  },
  {
    name: 'Pixel',
    avatar: '🕹️',
    tags: ['bubble-tea', 'escape-rooms', 'photography', 'brunch'],
    budgetMax: 2,
    dietary: ['vegetarian'],
    maxTravelMin: 20,
    availability: [{ startMin: 19 * 60, endMin: 22 * 60 + 30 }],
  },
  {
    name: 'Cog',
    avatar: '⚙️',
    tags: ['bbq', 'bowling', 'sports-bars', 'early-bird'],
    budgetMax: 3,
    dietary: [],
    maxTravelMin: 30,
    availability: [{ startMin: 17 * 60 + 30, endMin: 21 * 60 + 30 }],
  },
];
