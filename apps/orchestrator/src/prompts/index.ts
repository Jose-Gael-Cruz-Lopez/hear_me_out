import { z } from 'zod';

// One developer-message instruction block + one output schema per prompt (spec section 8).
// Shared tone and standing rules live in JUDGE_RULES (services/muse.ts). IDs travel as strings.

const id = z.string().regex(/^\d+$/);

export const distillProfile = {
  name: 'distill_profile',
  instructions: [
    'Turn what this player chose to share into at most 8 interest/taste tags for planning a group outing.',
    'Tags are kebab-case, 1-3 words (e.g. spicy-food, board-games, night-owl, cheap-eats, anime).',
    'Each tag gets a one-line "because…" reason that points to where it came from, and a source: chips, basics, paste, or social.',
    'Never infer sensitive traits (health, religion, sexuality, politics, ethnicity). Diet tags only if the player stated that diet.',
  ].join('\n'),
  schema: z.object({
    tags: z
      .array(z.object({ tag: z.string().max(32), reason: z.string().max(140), source: z.enum(['chips', 'basics', 'paste', 'social']) }))
      .max(8),
  }),
};

export const warmup = {
  name: 'warmup',
  instructions: [
    'Write one silly either/or "hot take" question per player, grounded in that player\'s tags.',
    'question <= 10 words, each choice <= 4 words. Light and inclusive; never about the person themselves.',
    'Return exactly one entry per playerId given.',
  ].join('\n'),
  schema: z.object({
    questions: z.array(z.object({ playerId: id, question: z.string().max(90), choiceA: z.string().max(36), choiceB: z.string().max(36) })),
  }),
};

export const menuDiet = {
  name: 'menu_diet',
  instructions: [
    "You read text crawled from one restaurant's own website, menu pages first.",
    'For each diet given, list up to 3 dishes from THIS text that clearly fit it: marked (V), (VG), (GF) and the like, named vegan/vegetarian/gluten-free, or whose listed ingredients plainly fit (no meat or fish for vegetarian).',
    'Copy each dish name exactly as written on the page. Never invent or reword dishes.',
    'If the site only makes a general promise ("vegan dishes are always included"), return that sentence, copied exactly, as the only entry.',
    'If nothing on the page fits a diet, return an empty list for it.',
  ].join('\n'),
  schema: z.object({ diets: z.array(z.object({ diet: z.string(), dishes: z.array(z.string().max(120)).max(3) })) }),
};

export const scoutQueries = {
  name: 'scout_queries',
  instructions: 'Given the group tags and category, return 2-4 Google Maps search strings that would find places this group would enjoy nearby.',
  schema: z.object({ queries: z.array(z.string().max(40)).min(2).max(4) }),
};

export const curate = {
  name: 'curate',
  instructions: [
    'Pick exactly n finalists from the candidates (already filtered for the group\'s hard constraints, best first).',
    'Prefer variety within the selected category. Prefer candidates with no stretchNote.',
    'For movie outings these are CINEMAS, not films or showtimes. Never invent a film, screening, ticket price or booking.',
    'For non-food outings do not claim diet support unless the candidate has explicit dietNotes. Unknown hours are not verified opening hours.',
    'For each finalist write fitSummary (<= 14 words) and one perPlayerFit line per player (<= 14 words), naming why it works',
    'for that person using ONLY the candidate data (diet notes, price, minutes away, tags). groupFitScore is 0-100.',
  ].join('\n'),
  schema: z.object({
    finalists: z.array(
      z.object({
        placeId: z.string(),
        fitSummary: z.string().max(120),
        groupFitScore: z.number().min(0).max(100),
        perPlayerFit: z.array(z.object({ playerId: id, line: z.string().max(120) })),
      })
    ),
  }),
};

export const assign = {
  name: 'assign',
  instructions: [
    'Each player must defend the option given (already assigned, usually not their own favorite).',
    'Write a stylePrompt: "Defend <option> like <persona> <twist>." at most 18 words, a fun persona plus a twist inspired by',
    'the player\'s tags and the option\'s details. Then 3 short factual hints drawn ONLY from the venue data given.',
  ].join('\n'),
  schema: z.object({
    briefs: z.array(z.object({ playerId: id, stylePrompt: z.string().max(160), hints: z.array(z.string().max(110)).length(3) })),
  }),
};

export const factcheck = {
  name: 'factcheck',
  instructions: [
    'Compare factual claims in this pitch transcript against the venue record (hours, price, rating, minutes away, dietary notes).',
    'Return at most one ruling: "sustained" when a claim is clearly contradicted by the record ("OBJECTION SUSTAINED: it closes at 9pm, not midnight."),',
    '"verified" when a specific claim checks out ("Claim verified: 4.7 stars from 1,200 reviews."), or "none" if there is no checkable claim.',
    'text <= 20 words, playful, never mean. Only use facts in the record.',
  ].join('\n'),
  schema: z.object({ kind: z.enum(['sustained', 'verified', 'none']), text: z.string().max(140) }),
};

export const awards = {
  name: 'awards',
  instructions: 'Pick the single funniest line from all the pitch transcripts. Quote it exactly (<= 15 words) and attribute it by playerId.',
  schema: z.object({ playerId: id, quote: z.string().max(120) }),
};

export const planCopy = {
  name: 'plan_copy',
  instructions: [
    'The group picked a winner. Write: inviteText (<= 40 words, warm and simple, uses only the supplied venue name and time);',
    'Do not invent venue history, family ownership, slogans, guarantees, special offers or reservation claims.',
    'whyForEach: one line per player naming them and why this plan works for them (from their tags and the fit lines);',
    'posterPrompt: a text-free contemporary editorial event-cover brief, at most 600 characters: one strong focal object grounded in the venue category, a limited considered palette, clean negative space.',
    'No text, letters, numerals, logos, ornate borders, confetti, collage, cuisine stereotypes or invented venue details/claims. The app composes the accurate venue name and time outside the art.',
    'icebreakers: 3 short conversation starters from the group\'s shared tags.',
  ].join('\n'),
  schema: z.object({
    inviteText: z.string().max(320),
    whyForEach: z.array(z.object({ playerId: id, line: z.string().max(140) })),
    posterPrompt: z.string().max(600),
    icebreakers: z.array(z.string().max(140)).max(3),
  }),
};

export const botPitch = {
  name: 'bot_pitch',
  instructions: [
    'Write a 60-80 word spoken pitch for each bot player, in its assigned style, defending its assigned venue.',
    'Use only the venue facts given; you may include one bold (checkable) claim from those facts. Funny, never mean.',
  ].join('\n'),
  schema: z.object({ pitches: z.array(z.object({ pitchId: id, text: z.string().max(700) })) }),
};

export const matchBlurb = {
  name: 'match_blurb',
  instructions: 'Given the shared approved tags between a visitor and an open lobby, write one line (<= 16 words) on why they would vibe.',
  schema: z.object({ line: z.string().max(120) }),
};

export const icebreakers = {
  name: 'icebreakers',
  instructions: 'Write 3 short icebreaker questions for strangers meeting up, from their shared approved tags.',
  schema: z.object({ icebreakers: z.array(z.string().max(140)).length(3) }),
};

export const mergeIntro = {
  name: 'merge_intro',
  instructions: 'Two groups picked the same place at the same time and agreed to merge tables. Write one warm, funny intro (<= 40 words) that names both groups and gives them one thing to talk about from their shared tags.',
  schema: z.object({ text: z.string().max(320) }),
};
