// Shapes for the "hidden gems" layer: what the Apify sources say about each place.
// Import-free so scripts can load it with Node's type stripping.

export type MentionSource = 'reddit' | 'instagram' | 'tiktok' | 'press' | 'events';
export type GemSource = 'maps' | MentionSource;

/** One public post, comment, article or listing from a non-Maps source. */
export interface Mention {
  source: MentionSource;
  text: string;
  url: string;
  /** ISO date when the source gives one. */
  date: string | null;
  /** Likes / upvotes / plays, when the source gives one. */
  engagement: number;
}

/** A short quote shown to players as proof, always with a link back to the source. */
export interface Evidence {
  source: GemSource;
  quote: string;
  url: string;
  date: string | null;
}

export interface GemInfo {
  /** 0–100. 60+ is shown as a hidden gem. */
  score: number;
  /** Plain-language reasons, best first ("4.8★ with only 52 reviews"). */
  reasons: string[];
  evidence: Evidence[];
  /** Hangout signals read from reviews and posts ("good for talking", "open late"). */
  hangout: string[];
  /** How many mentions each source contributed. */
  counts: Partial<Record<GemSource, number>>;
  /** Appears on big "best of" lists, so it's not really hidden. */
  known: boolean;
}

export const GEM_THRESHOLD = 60;
