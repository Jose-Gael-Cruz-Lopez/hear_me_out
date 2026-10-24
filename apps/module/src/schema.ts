import { schema, table, t } from 'spacetimedb/server';

// ---------- Shared object types ----------

/** Minutes from local midnight of the room's day. endMin may exceed 1440 (after midnight). */
export const TimeWindow = t.object('TimeWindow', {
  startMin: t.i32(),
  endMin: t.i32(),
});

export const TagReason = t.object('TagReason', {
  tag: t.string(),
  reason: t.string(),
  source: t.string(),
});

export const SocialLink = t.object('SocialLink', {
  platform: t.string(),
  handle: t.string(),
});

/** A line of text about one player (fit lines, "why this works for you", etc). */
export const PlayerLine = t.object('PlayerLine', {
  playerId: t.u64(),
  line: t.string(),
});

const venueFields = {
  placeId: t.string(),
  title: t.string(),
  category: t.string(),
  address: t.string(),
  lat: t.f64(),
  lng: t.f64(),
  /** 0 = unknown, 1..4 = $..$$$$ */
  priceLevel: t.u8(),
  rating: t.f64(),
  reviewCount: t.u32(),
  hoursText: t.string(),
  hoursKnown: t.bool(),
  openIntervals: t.array(TimeWindow),
  mapsUrl: t.string(),
  imageUrl: t.string(),
  reviewSnippets: t.array(t.string()),
  dietaryNotes: t.array(t.string()),
  distanceKm: t.f64(),
  travelMin: t.u16(),
  fitSummary: t.string(),
  perPlayerFit: t.array(PlayerLine),
  groupFitScore: t.u8(),
  stretchNote: t.string(),
};

export const OptionInput = t.object('OptionInput', {
  ...venueFields,
  /** Google popular times: 168 values (weekday 0=Sunday × 24 + hour), 0–100; [] when unknown. */
  busyness: t.array(t.u8()),
});

/** A real dish from a venue's own menu that fits a diet ("vegan", "Tofu Larb (V)"). */
export const MenuDish = t.object('MenuDish', { diet: t.string(), dish: t.string() });

export const MenuProofInput = t.object('MenuProofInput', {
  optionId: t.u64(),
  status: t.string(),
  dishes: t.array(MenuDish),
  sourceUrl: t.string(),
});

export const BriefInput = t.object('BriefInput', {
  playerId: t.u64(),
  stylePrompt: t.string(),
  hints: t.array(t.string()),
});

export const WarmupInput = t.object('WarmupInput', {
  playerId: t.u64(),
  question: t.string(),
  choiceA: t.string(),
  choiceB: t.string(),
});

export const BotPitchInput = t.object('BotPitchInput', {
  pitchId: t.u64(),
  text: t.string(),
});

// ---------- Tables ----------

/** Private: the publisher's identity, used to authorize the orchestrator. */
const config = table(
  { name: 'config' },
  {
    id: t.u32().primaryKey(),
    adminIdentity: t.identity(),
  }
);

const room = table(
  { name: 'room', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    code: t.string().unique(),
    /** friends | strangers */
    mode: t.string(),
    /** '' | food | activity | movie */
    category: t.string(),
    hostIdentity: t.identity(),
    phase: t.string(),
    /** Increments on every phase (and playback step) change; timers carry it to detect staleness. */
    phaseSeq: t.u32(),
    phaseStartedAt: t.timestamp(),
    phaseDeadline: t.option(t.timestamp()),
    locationLabel: t.string(),
    lat: t.f64(),
    lng: t.f64(),
    hasGeo: t.bool(),
    /** Minutes to add to UTC to get the room's local time (e.g. -420 for PDT). */
    tzOffsetMin: t.i32(),
    isPublic: t.bool(),
    vibeTags: t.array(t.string()),
    /** Shown on the TV while the AI works ("The Judge is reviewing the evidence…"). */
    aiStatus: t.string(),
    /** '' | running | done | failed */
    scoutStatus: t.string(),
    venueKey: t.string(),
    currentPitchIdx: t.u32(),
    winnerOptionId: t.u64(),
    tiebreakText: t.string(),
    /** Short timers for the simulator and quick tests. */
    fastMode: t.bool(),
    createdAt: t.timestamp(),
    /** "The Taco Lawyers": shown in merge offers. */
    groupName: t.string().default(''),
    /** Strangers mode: intended start, local minutes; -1 = flexible. */
    targetStartMin: t.i32().default(-1),
  }
);

const player = table(
  { name: 'player', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.identity().index('btree'),
    roomId: t.u64().index('btree'),
    name: t.string(),
    avatar: t.string(),
    isBot: t.bool(),
    connected: t.bool(),
    ready: t.bool(),
    /** room.phaseSeq at the player's last action, so screens can show who is done. */
    actedSeq: t.u32(),
    seat: t.u8(),
    joinedAt: t.timestamp(),
  }
);

const profilePublic = table(
  { name: 'profile_public', public: true },
  {
    playerId: t.u64().primaryKey(),
    roomId: t.u64().index('btree'),
    approvedTags: t.array(t.string()),
    /** 1..4 */
    budgetMax: t.u8(),
    dietary: t.array(t.string()),
    maxTravelMin: t.u16(),
    availability: t.array(TimeWindow),
  }
);

/** Private: a player's inputs and unapproved tags. Exposed only to that player (view) and the admin (job payloads). */
const profileDraft = table(
  { name: 'profile_draft' },
  {
    playerId: t.u64().primaryKey(),
    identity: t.identity().index('btree'),
    roomId: t.u64(),
    vibeChips: t.array(t.string()),
    pastedContext: t.string(),
    socialLinks: t.array(SocialLink),
    consent: t.bool(),
    draftTags: t.array(TagReason),
    /** empty | distilling | ready | approved | failed */
    status: t.string(),
    note: t.string(),
  }
);

/** Private: normalized venue lists keyed by area + category + queries. */
const venueCache = table(
  { name: 'venue_cache' },
  {
    key: t.string().primaryKey(),
    category: t.string(),
    query: t.string(),
    source: t.string(),
    itemsJson: t.string(),
    fetchedAt: t.timestamp(),
  }
);

const option = table(
  { name: 'option', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index('btree'),
    sortOrder: t.u8(),
    ...venueFields,
    posterUrl: t.string(),
    posterMediaId: t.u64(),
    /** Google popular times: 168 values (weekday 0=Sunday × 24 + hour), 0–100; [] when unknown. */
    busyness: t.array(t.u8()).default([]),
  }
);

const assignment = table(
  { name: 'assignment', public: true },
  {
    playerId: t.u64().primaryKey(),
    roomId: t.u64().index('btree'),
    optionId: t.u64(),
    stylePrompt: t.string(),
    hints: t.array(t.string()),
    coCounsel: t.bool(),
  }
);

const pitch = table(
  { name: 'pitch', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index('btree'),
    playerId: t.u64(),
    optionId: t.u64(),
    playOrder: t.u8(),
    audioMediaId: t.u64(),
    audioMime: t.string(),
    liveCaption: t.string(),
    transcript: t.string(),
    /** '' | muse | browser | typed | bot */
    transcriptSource: t.string(),
    /** waiting | transcribing | needs_text | ready | skipped */
    status: t.string(),
    durationMs: t.u32(),
    recordings: t.u8(),
    /** pending | sustained | verified | none */
    rulingKind: t.string(),
    rulingText: t.string(),
  }
);

/** Event table: rows are broadcast to subscribers and never stored. */
const reaction = table(
  { name: 'reaction', public: true, event: true },
  {
    roomId: t.u64(),
    pitchId: t.u64(),
    playerId: t.u64(),
    emoji: t.string(),
  }
);

const objection = table(
  { name: 'objection', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index('btree'),
    pitchId: t.u64(),
    playerId: t.u64(),
  }
);

const warmup = table(
  { name: 'warmup', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index('btree'),
    playerId: t.u64(),
    question: t.string(),
    choiceA: t.string(),
    choiceB: t.string(),
    /** '' | a | b */
    answer: t.string(),
  }
);

/** Private: secret favorite before the pitches. Each player can read their own via a view. */
const prevote = table(
  { name: 'prevote' },
  {
    playerId: t.u64().primaryKey(),
    roomId: t.u64().index('btree'),
    optionId: t.u64(),
  }
);

/**
 * Private: each player's live lean while the pitches play, seeded from their pre-vote. Nobody can read
 * another player's row; only anonymous per-option totals leave the module (the `room_sway` view).
 */
const lean = table(
  { name: 'lean' },
  {
    playerId: t.u64().primaryKey(),
    roomId: t.u64().index('btree'),
    optionId: t.u64(),
    updatedAt: t.timestamp(),
  }
);

const vote = table(
  { name: 'vote', public: true },
  {
    playerId: t.u64().primaryKey(),
    roomId: t.u64().index('btree'),
    optionId: t.u64(),
  }
);

const award = table(
  { name: 'award', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index('btree'),
    /** most_persuasive | best_line */
    kind: t.string(),
    playerId: t.u64(),
    text: t.string(),
  }
);

/**
 * Menu check: proof from each food finalist's own website that it serves the diets someone in the room
 * asked for (Apify Website Content Crawler). Google's "vegan options" flags are often missing.
 */
const menuProof = table(
  { name: 'menu_proof', public: true },
  {
    optionId: t.u64().primaryKey(),
    roomId: t.u64().index('btree'),
    diets: t.array(t.string()),
    /** checking | confirmed | not_found | no_website | unavailable */
    status: t.string(),
    dishes: t.array(MenuDish),
    sourceUrl: t.string(),
    checkedAt: t.timestamp(),
  }
);

const plan = table(
  { name: 'plan', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().unique(),
    optionId: t.u64(),
    startAt: t.timestamp(),
    endAt: t.timestamp(),
    slotLabel: t.string(),
    cantMake: t.array(t.u64()),
    inviteText: t.string(),
    whyForEach: t.array(PlayerLine),
    posterPrompt: t.string(),
    posterUrl: t.string(),
    posterMediaId: t.u64(),
    icebreakers: t.array(t.string()),
    /** drafting | ready */
    status: t.string(),
    meetupConfirmed: t.bool(),
    /** Set on both plans when a merge offer is accepted. */
    mergedWithRoomId: t.u64().default(0n),
    /** Busyness-aware timing: local weekday of the plan (0 = Sunday), -1 when no popular times. */
    weekday: t.i32().default(-1),
    /** The earliest slot everyone could make (minutes from local midnight) and how packed it usually is. */
    naiveStartMin: t.i32().default(-1),
    naiveBusyPct: t.i32().default(-1),
    /** How packed the venue usually is at the chosen start. */
    busyPct: t.i32().default(-1),
  }
);

const rsvp = table(
  { name: 'rsvp', public: true },
  {
    playerId: t.u64().primaryKey(),
    planId: t.u64().index('btree'),
    roomId: t.u64(),
    /** yes | maybe | no */
    status: t.string(),
  }
);

const mergeOffer = table(
  { name: 'merge_offer', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomA: t.u64().index('btree'),
    roomB: t.u64().index('btree'),
    venueTitle: t.string(),
    slotLabel: t.string(),
    /** open | accepted | declined */
    status: t.string(),
    introText: t.string(),
    createdAt: t.timestamp(),
  }
);

const mergeVote = table(
  { name: 'merge_vote', public: true },
  {
    playerId: t.u64().primaryKey(),
    offerId: t.u64().index('btree'),
    roomId: t.u64(),
    yes: t.bool(),
  }
);

/** Private: a visitor's lobby matches (strangers mode), exposed only to them via my_lobby_matches. */
const lobbyMatch = table(
  { name: 'lobby_match' },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.identity().index('btree'),
    roomId: t.u64(),
    score: t.u8(),
    sharedTags: t.array(t.string()),
    distanceKm: t.f64(),
    blurb: t.string(),
    createdAt: t.timestamp(),
  }
);

/** Private: block & report records (strangers mode). */
const report = table(
  { name: 'report' },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index('btree'),
    reporterPlayerId: t.u64(),
    reportedPlayerId: t.u64(),
    reason: t.string(),
    createdAt: t.timestamp(),
  }
);

/**
 * Private: the WhatsApp group invite link for a meetup, pasted by someone going. Exposed only to people who
 * RSVP'd yes (and the host) through the my_group_chat view, so the link never sits in the public plan row.
 */
const groupChat = table(
  { name: 'group_chat' },
  {
    roomId: t.u64().primaryKey(),
    inviteUrl: t.string(),
    setByIdentity: t.identity(),
    updatedAt: t.timestamp(),
  }
);

/** Pitch audio and posters, stored as bytes. Only the TV subscribes to a room's media. */
const media = table(
  { name: 'media', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index('btree'),
    /** pitch_audio | poster */
    kind: t.string(),
    mime: t.string(),
    bytes: t.array(t.u8()),
    createdAt: t.timestamp(),
  }
);

/** Private: work for the orchestrator. Exposed to the admin identity through the admin_jobs view. */
const aiJob = table(
  { name: 'ai_job' },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index('btree'),
    kind: t.string(),
    /** queued | running | done | failed */
    status: t.string().index('btree'),
    refId: t.u64(),
    payloadJson: t.string(),
    resultJson: t.string(),
    error: t.string(),
    attempts: t.u8(),
    createdAt: t.timestamp(),
    claimedAt: t.option(t.timestamp()),
  }
);

/** Scheduled: drives server-authoritative phase deadlines. */
const phaseTimer = table(
  { name: 'phase_timer' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    roomId: t.u64(),
    phaseSeq: t.u32(),
  }
);

/** Scheduled (repeating): requeues stuck jobs and cleans up old rooms and media. */
const janitorTimer = table(
  { name: 'janitor_timer' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

const spacetimedb = schema({
  config,
  room,
  player,
  profilePublic,
  profileDraft,
  venueCache,
  option,
  assignment,
  pitch,
  reaction,
  objection,
  warmup,
  prevote,
  lean,
  vote,
  award,
  menuProof,
  plan,
  rsvp,
  mergeOffer,
  mergeVote,
  lobbyMatch,
  report,
  groupChat,
  media,
  aiJob,
  phaseTimer,
  janitorTimer,
});

export default spacetimedb;
export {
  config,
  room,
  player,
  profilePublic,
  profileDraft,
  venueCache,
  option,
  assignment,
  pitch,
  reaction,
  objection,
  warmup,
  prevote,
  lean,
  vote,
  award,
  menuProof,
  plan,
  rsvp,
  mergeOffer,
  mergeVote,
  lobbyMatch,
  report,
  groupChat,
  media,
  aiJob,
  phaseTimer,
  janitorTimer,
};
