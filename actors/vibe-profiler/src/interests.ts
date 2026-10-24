/**
 * Keyword-to-interest dictionary used by the deterministic enrichment.
 *
 * A post matches a rule when its text (or platform alt text) contains one of `words` as a whole word
 * (simple plurals are matched automatically), one of its hashtags equals or contains one of `stems`
 * (stems shorter than 4 characters, or prefixed with "=", must match exactly: "=band" must not hit
 * "#husband"), or the text contains one of `emoji`.
 * A sub-interest match also counts as a match for its parent interest.
 *
 * Deliberately absent: anything about health, religion, sexuality, politics, ethnicity or diet.
 */

export const INTERESTS = [
  'food',
  'nightlife',
  'outdoors',
  'gaming',
  'film',
  'music',
  'fitness',
  'arts',
  'sports',
  'travel',
] as const;

export type Interest = (typeof INTERESTS)[number];

export interface InterestRule {
  /** Stable id, also used as the interest name in the output. */
  id: string;
  /** Parent interest for sub-interests; null for top-level interests. */
  parent: Interest | null;
  /** Kebab-case vibe tag emitted for this rule. */
  tag: string;
  /** Human label used in tag reasons. */
  label: string;
  words: string[];
  stems: string[];
  emoji: string[];
}

const rule = (
  id: string,
  parent: Interest | null,
  tag: string,
  label: string,
  words: string[],
  stems: string[],
  emoji: string[] = []
): InterestRule => ({ id, parent, tag, label, words, stems, emoji });

export const INTEREST_RULES: readonly InterestRule[] = [
  // ---------------------------------------------------------------- food
  rule(
    'food',
    null,
    'foodie',
    'food',
    ['food', 'foodie', 'restaurant', 'eatery', 'dinner', 'lunch', 'breakfast', 'delicious', 'yummy', 'tasty', 'chef', 'recipe',
      'cooking', 'homemade', 'dish', 'menu', 'cuisine', 'snack', 'noodle', 'dumpling', 'pho', 'curry', 'street food', 'food truck',
      'eats', 'foodcoma', 'tasting menu', 'michelin', 'pasta', 'steak', 'seafood', 'bakery', 'bakeries'],
    ['food', 'foodie', 'foodporn', 'foodstagram', 'instafood', '=eats', 'yummy', 'delicious', 'restaurant', 'dinner', 'chef',
      'recipe', 'cooking', 'homecooking', 'foodlover', 'michelin', 'pasta', 'seafood', 'noodles', 'dumpling'],
    ['🍔', '🍕', '🍜', '🍣', '🌮', '🌯', '🍝', '🍲', '🥘', '🍛', '🍱', '🥟', '🍤', '🍗', '🍖', '🍽', '🥡', '🍳', '🥗', '🥩']
  ),
  rule('ramen', 'food', 'ramen', 'ramen', ['ramen', 'tonkotsu', 'tsukemen', 'shoyu ramen', 'miso ramen'], ['ramen', 'tonkotsu', 'tsukemen'], ['🍜']),
  rule(
    'tacos',
    'food',
    'tacos',
    'tacos',
    ['taco', 'taqueria', 'burrito', 'quesadilla', 'al pastor', 'birria', 'carnitas', 'elote', 'nachos', 'taco tuesday'],
    ['taco', 'taqueria', 'burrito', 'birria', 'tacotuesday', 'alpastor'],
    ['🌮', '🌯']
  ),
  rule('sushi', 'food', 'sushi', 'sushi', ['sushi', 'sashimi', 'omakase', 'nigiri', 'hand roll'], ['sushi', 'sashimi', 'omakase'], ['🍣']),
  rule('pizza', 'food', 'pizza', 'pizza', ['pizza', 'pizzeria', 'neapolitan'], ['pizza', 'pizzeria'], ['🍕']),
  rule('burgers', 'food', 'burgers', 'burgers', ['burger', 'cheeseburger', 'smashburger', 'smash burger'], ['burger'], ['🍔']),
  rule(
    'bbq',
    'food',
    'bbq',
    'barbecue',
    ['bbq', 'barbecue', 'brisket', 'smoked meat', 'korean bbq', 'kbbq', 'pulled pork'],
    ['bbq', 'barbecue', 'kbbq', 'brisket'],
    ['🍖']
  ),
  rule(
    'coffee',
    'food',
    'coffee',
    'coffee',
    ['coffee', 'espresso', 'latte', 'cappuccino', 'americano', 'cold brew', 'barista', 'cafe', 'café', 'pour over', 'flat white'],
    ['coffee', 'espresso', 'latte', 'barista', 'cafe', 'coldbrew', 'latteart'],
    ['☕']
  ),
  rule('boba', 'food', 'boba', 'boba & tea', ['boba', 'bubble tea', 'milk tea', 'matcha'], ['boba', 'bubbletea', 'milktea', 'matcha'], ['🧋']),
  rule(
    'dessert',
    'food',
    'dessert',
    'dessert',
    ['dessert', 'cake', 'cupcake', 'ice cream', 'gelato', 'donut', 'doughnut', 'pastry', 'pastries', 'croissant', 'cookie',
      'brownie', 'macaron', 'churro', 'cheesecake', 'chocolate', 'sweet tooth', 'waffle', 'crepe', 'mochi', 'tiramisu'],
    ['dessert', 'cake', 'icecream', 'gelato', 'donut', 'pastry', 'bakery', 'sweettooth', 'chocolate', 'cookies', 'macaron'],
    ['🍰', '🧁', '🍩', '🍦', '🍨', '🍪', '🎂', '🍫', '🍮', '🥐']
  ),
  rule(
    'spicy-food',
    'food',
    'spicy-food',
    'spicy food',
    ['spicy', 'hot sauce', 'hot pot', 'hotpot', 'chili', 'chilli', 'jalapeno', 'jalapeño', 'habanero', 'sriracha', 'szechuan',
      'sichuan', 'nashville hot', 'buffalo wings', 'hot wings', 'ghost pepper', 'carolina reaper', 'extra spicy'],
    ['spicy', 'hotsauce', 'hotpot', 'chili', 'chilli', 'sichuan', 'szechuan', 'spicyfood', 'nashvillehot'],
    ['🌶', '🥵']
  ),
  rule('brunch', 'food', 'brunch', 'brunch', ['brunch', 'mimosa', 'eggs benedict', 'pancake', 'avocado toast', 'bottomless brunch'], ['brunch', 'mimosa', 'pancakes'], ['🥞']),

  // ---------------------------------------------------------------- nightlife
  rule(
    'nightlife',
    null,
    'nightlife',
    'nightlife',
    ['nightlife', 'nightclub', 'clubbing', 'cocktail', 'mixology', 'bartender', 'speakeasy', 'happy hour', 'pub', 'brewery', 'breweries',
      'craft beer', 'beer', 'wine', 'wine bar', 'cocktail bar', 'rooftop bar', 'dj', 'rave', 'party', 'parties', 'partying', 'night out',
      'dance floor', 'lounge', 'tequila', 'mezcal', 'whiskey', 'after party', 'bar crawl', 'pub crawl', 'last call'],
    ['nightlife', 'nightout', 'nightclub', 'clubbing', 'cocktail', 'mixology', 'bartender', 'speakeasy', 'happyhour', 'brewery',
      'craftbeer', 'beer', 'wine', 'rooftop', 'party', '=rave', '=techno', 'dj'],
    ['🍸', '🍹', '🍻', '🍺', '🥂', '🍷', '🪩', '🥃', '🍾']
  ),
  rule(
    'cocktails',
    'nightlife',
    'cocktails',
    'cocktails',
    ['cocktail', 'mixology', 'speakeasy', 'martini', 'margarita', 'negroni', 'old fashioned', 'mezcal', 'bartender', 'spritz'],
    ['cocktail', 'mixology', 'speakeasy', 'martini', 'margarita', 'negroni'],
    ['🍸', '🍹']
  ),

  // ---------------------------------------------------------------- outdoors
  rule(
    'outdoors',
    null,
    'outdoorsy',
    'the outdoors',
    ['outdoors', 'outdoor', 'hike', 'hiking', 'hiker', 'trail', 'camping', 'backpacking', 'mountain', 'summit', 'kayak', 'kayaking',
      'canoe', 'surf', 'surfing', 'beach', 'lake', 'river', 'ocean', 'forest', 'woods', 'national park', 'nature', 'wildlife',
      'waterfall', 'picnic', 'ski', 'skiing', 'snowboard', 'snowboarding', 'fishing', 'wilderness', 'desert', 'canyon', 'glacier',
      'volcano', 'coast', 'great outdoors', 'birding', 'birdwatching', 'safari', 'sunrise', 'sunset', 'reef', 'savanna'],
    ['outdoor', 'hike', 'hiking', 'trail', 'camping', 'nature', 'wildlife', 'mountain', 'beach', 'ocean', 'sunset', 'sunrise',
      'optoutside', 'getoutside', 'nationalpark', 'adventure', 'ski', 'surfing', 'forest', 'wilderness', 'earth', 'wild', 'planetearth'],
    ['🏔', '⛰', '🏕', '🌲', '🌳', '🥾', '🏞', '🌊', '🏖', '🌅', '🌄', '🚣', '🏄', '🎿', '🏂', '🌋', '🏝', '🌿']
  ),
  rule(
    'hiking',
    'outdoors',
    'hiking',
    'hiking',
    ['hike', 'hiking', 'hiker', 'trail', 'trek', 'trekking', 'backpacking', 'summit', 'trailhead'],
    ['hike', 'hiking', 'trail', '=trek', 'trekking', 'backpacking'],
    ['🥾']
  ),
  rule('beach', 'outdoors', 'beach-days', 'beach days', ['beach', 'surf', 'surfing', 'seaside', 'beach day', 'snorkeling'], ['beach', 'surfing', '=surf', 'snorkel'], ['🏖', '🏄', '🏝']),
  rule(
    'wildlife',
    'outdoors',
    'wildlife',
    'wildlife',
    ['wildlife', 'animal', 'bird', 'birding', 'safari', 'conservation', 'species', 'endangered', 'whale', 'shark', 'elephant',
      'vulture', 'nudibranch', 'coral', 'predator'],
    ['wildlife', 'animals', 'birding', 'safari', 'conservation', 'photoark', 'endangered'],
    ['🦅', '🐘', '🦁', '🐻', '🐾', '🦋', '🐋', '🦈', '🐢', '🦒']
  ),

  // ---------------------------------------------------------------- gaming
  rule(
    'gaming',
    null,
    'gamer',
    'gaming',
    ['gaming', 'gamer', 'video game', 'videogame', 'nintendo', 'playstation', 'ps5', 'xbox', 'steam deck', 'twitch', 'esports',
      'board game', 'boardgame', 'tabletop', 'dungeons and dragons', 'd&d', 'dnd', 'catan', 'chess', 'arcade', 'game night',
      'minecraft', 'fortnite', 'zelda', 'pokemon', 'pokémon', 'mario kart', 'valorant', 'speedrun', 'escape room'],
    ['gaming', 'gamer', 'videogame', 'nintendo', 'playstation', 'ps5', 'xbox', 'twitch', 'esports', 'boardgame', 'tabletop',
      'dnd', 'catan', 'chess', 'arcade', 'gamenight', 'minecraft', 'fortnite', 'pokemon', 'zelda', 'escaperoom'],
    ['🎮', '🕹', '🎲', '♟', '👾']
  ),
  rule(
    'board-games',
    'gaming',
    'board-games',
    'board games',
    ['board game', 'boardgame', 'tabletop', 'catan', 'dungeons and dragons', 'd&d', 'dnd', 'game night', 'meeple', 'chess'],
    ['boardgame', 'tabletop', 'dnd', 'catan', 'gamenight', 'meeple', 'chess'],
    ['🎲', '♟']
  ),
  rule(
    'video-games',
    'gaming',
    'video-games',
    'video games',
    ['video game', 'videogame', 'nintendo', 'playstation', 'ps5', 'xbox', 'steam deck', 'twitch', 'esports', 'minecraft',
      'fortnite', 'zelda', 'pokemon', 'pokémon', 'mario kart', 'valorant', 'speedrun'],
    ['videogame', 'nintendo', 'playstation', 'ps5', 'xbox', 'twitch', 'esports', 'minecraft', 'fortnite', 'pokemon', 'zelda', 'gamer'],
    ['🎮', '🕹', '👾']
  ),

  // ---------------------------------------------------------------- film
  rule(
    'film',
    null,
    'movie-buff',
    'movies',
    ['movie', 'film', 'cinema', 'movie theater', 'movie night', 'netflix', 'box office', 'screening', 'premiere', 'trailer',
      'film festival', 'oscars', 'letterboxd', 'horror movie', 'sci-fi', 'imax', 'popcorn', 'anime', 'ghibli', 'marvel',
      'star wars', 'a24', 'documentary', 'blockbuster'],
    ['movie', 'film', 'cinema', 'movienight', 'netflix', 'letterboxd', 'horrormovies', 'anime', 'ghibli', '=marvel', 'starwars',
      'a24', 'imax', 'oscars', 'documentary'],
    ['🎬', '🍿', '🎥', '📽', '🎞']
  ),
  rule(
    'anime',
    'film',
    'anime',
    'anime',
    ['anime', 'manga', 'ghibli', 'studio ghibli', 'otaku', 'cosplay', 'one piece', 'naruto', 'demon slayer', 'jujutsu kaisen'],
    ['anime', 'manga', 'ghibli', 'otaku', 'cosplay', 'onepiece', 'naruto']
  ),

  // ---------------------------------------------------------------- music
  rule(
    'music',
    null,
    'music-lover',
    'music',
    ['music', 'concert', 'gig', 'live music', 'music festival', 'band', 'album', 'playlist', 'vinyl', 'record store', 'spotify',
      'song', 'singer', 'guitar', 'piano', 'drums', 'jazz', 'hip hop', 'hiphop', 'edm', 'techno', 'house music', 'k-pop', 'kpop',
      'indie', 'punk', 'open mic', 'opera', 'orchestra', 'symphony', 'karaoke', 'setlist', 'coachella', 'new music'],
    ['music', 'concert', 'livemusic', 'gig', 'musicfestival', '=band', 'vinyl', 'spotify', 'playlist', 'guitar', 'piano', 'jazz',
      'hiphop', 'edm', '=techno', 'kpop', 'indiemusic', '=punk', 'punkrock', 'openmic', 'coachella', 'newmusic', 'karaoke'],
    ['🎵', '🎶', '🎼', '🎸', '🎤', '🎧', '🎹', '🥁', '🎷', '🎺', '🎻', '💿']
  ),
  rule(
    'live-music',
    'music',
    'live-music',
    'live music',
    ['concert', 'gig', 'live music', 'music festival', 'setlist', 'open mic', 'coachella', 'front row', 'mosh pit', 'encore'],
    ['concert', 'livemusic', 'gig', 'musicfestival', 'setlist', 'openmic', 'coachella']
  ),
  rule('karaoke', 'music', 'karaoke', 'karaoke', ['karaoke', 'noraebang'], ['karaoke', 'noraebang'], ['🎤']),

  // ---------------------------------------------------------------- fitness
  rule(
    'fitness',
    null,
    'fitness',
    'fitness',
    ['fitness', 'gym', 'workout', 'work out', 'lifting', 'weightlifting', 'powerlifting', 'crossfit', 'yoga', 'pilates',
      'running', 'runner', 'marathon', 'half marathon', '5k', '10k', 'cycling', 'bike ride', 'spin class', 'peloton', 'hiit',
      'cardio', 'leg day', 'bouldering', 'rock climbing', 'swimming', 'triathlon', 'personal best'],
    ['fitness', 'fit', 'fitfam', 'gym', 'workout', 'crossfit', 'yoga', 'pilates', 'running', 'runner', 'marathon', 'cycling',
      'peloton', 'hiit', 'legday', 'bouldering', 'climbing', 'triathlon', 'strava'],
    ['💪', '🏋', '🧘', '🏃', '🚴', '🤸', '🏊', '🧗']
  ),
  rule(
    'running',
    'fitness',
    'running',
    'running',
    ['running', 'runner', 'marathon', 'half marathon', '5k', '10k', 'jogging', 'strava', 'trail run', 'run club'],
    ['running', 'runner', 'marathon', 'strava', 'runclub'],
    ['🏃']
  ),
  rule('yoga', 'fitness', 'yoga', 'yoga', ['yoga', 'pilates', 'vinyasa', 'yoga class'], ['yoga', 'pilates'], ['🧘']),
  rule('climbing', 'fitness', 'climbing', 'climbing', ['climbing', 'bouldering', 'rock climbing', 'climbing gym'], ['climbing', 'bouldering', 'climb'], ['🧗']),

  // ---------------------------------------------------------------- arts
  rule(
    'arts',
    null,
    'arts-and-culture',
    'arts & culture',
    ['art', 'arts', 'artist', 'artwork', 'museum', 'gallery', 'galleries', 'exhibit', 'exhibition', 'painting', 'drawing', 'sketch',
      'illustration', 'sculpture', 'ceramics', 'pottery', 'theatre', 'theater', 'broadway', 'musical theater', 'musical theatre', 'ballet', 'street art',
      'mural', 'graffiti', 'photography', 'photographer', 'poetry', 'crochet', 'knitting', 'comedy', 'stand-up', 'improv'],
    ['art', '=arts', 'artist', 'artwork', 'museum', 'gallery', 'exhibit', 'painting', 'drawing', 'sketch', 'illustration',
      'sculpture', 'ceramics', 'pottery', 'theatre', 'theater', 'broadway', 'ballet', 'streetart', 'mural', 'graffiti',
      'photography', 'photographer', 'poetry', 'crochet', 'comedy', 'standup'],
    ['🎨', '🖼', '🎭', '🖌', '🩰', '🧶']
  ),
  rule(
    'museums',
    'arts',
    'museums',
    'museums & galleries',
    ['museum', 'gallery', 'galleries', 'exhibit', 'exhibition', 'art show'],
    ['museum', 'gallery', 'exhibit'],
    ['🖼', '🏛']
  ),
  rule('theater', 'arts', 'theater', 'theater', ['theatre', 'theater', 'broadway', 'west end', 'musical theater', 'musical theatre', 'opening night'], ['theatre', 'theater', 'broadway'], ['🎭']),
  rule(
    'comedy',
    'arts',
    'comedy-shows',
    'comedy',
    ['comedy', 'comedian', 'stand-up', 'standup', 'comedy club', 'improv', 'comedy show'],
    ['comedy', 'standup', 'comedian', 'improv']
  ),

  // ---------------------------------------------------------------- sports
  rule(
    'sports',
    null,
    'sports-fan',
    'sports',
    ['sports', 'basketball', 'football', 'soccer', 'baseball', 'hockey', 'tennis', 'golf', 'volleyball', 'nba', 'nfl', 'mlb', 'nhl',
      'mls', 'wnba', 'premier league', 'world cup', 'game day', 'gameday', 'playoffs', 'super bowl', 'march madness', 'sports bar',
      'stadium', 'tailgate', 'ufc', 'boxing', 'f1', 'formula 1', 'nascar', 'cricket', 'rugby', 'pickleball', 'bowling',
      'fantasy football', 'touchdown', 'slam dunk'],
    ['sports', 'basketball', 'football', 'soccer', 'baseball', 'hockey', 'tennis', 'golf', 'volleyball', 'nba', 'nfl', 'mlb', 'nhl',
      'wnba', 'premierleague', 'worldcup', 'gameday', 'playoffs', 'superbowl', 'marchmadness', 'ufc', 'boxing', 'f1', 'formula1',
      'nascar', 'cricket', 'rugby', 'pickleball', 'bowling'],
    ['🏀', '🏈', '⚽', '⚾', '🏒', '🎾', '⛳', '🏐', '🏆', '🥊', '🏟', '🏏', '🏉', '🎳']
  ),
  rule('bowling', 'sports', 'bowling', 'bowling', ['bowling', 'bowling alley'], ['bowling'], ['🎳']),

  // ---------------------------------------------------------------- travel
  rule(
    'travel',
    null,
    'traveler',
    'travel',
    ['travel', 'traveling', 'travelling', 'trip', 'vacation', 'wanderlust', 'passport', 'abroad', 'road trip', 'roadtrip', 'flight',
      'airport', 'getaway', 'itinerary', 'jet lag', 'solo travel', 'bucket list', 'sightseeing', 'hostel', 'expedition'],
    ['travel', 'travelgram', 'wanderlust', 'vacation', 'roadtrip', 'passport', 'getaway', 'bucketlist', 'traveltheworld',
      'instatravel', 'travelphotography', 'expedition'],
    ['✈', '🧳', '🗺', '🌍', '🌎', '🌏']
  ),
];

/**
 * Words cut out of a hashtag before stem matching because they contain an unrelated stem
 * ("sacramento" contains "ramen", "signature" ends in "nature", "trailer" starts with "trail").
 */
export const HASHTAG_COLLISIONS: readonly string[] = ['sacramento', 'signature', 'trailer', 'upcycl', 'hospitality'];

/** Hashtags that carry no taste signal; excluded from `topHashtags`. */
export const GENERIC_HASHTAGS: ReadonlySet<string> = new Set([
  'fyp', 'foryou', 'foryoupage', 'fy', 'viral', 'trending', 'explore', 'explorepage', 'reels', 'reel', 'instagood', 'instagram',
  'tiktok', 'love', 'photooftheday', 'like4like', 'likeforlike', 'follow', 'followme', 'instadaily', 'picoftheday', 'repost',
  'tbt', 'facebook', 'video', 'photo', 'new', 'trend',
]);

/**
 * Words that must never appear in an emitted tag. Health, religion, sexuality and gender identity,
 * politics, ethnicity and diet are never inferred from posts.
 */
export const SENSITIVE_TAG_WORDS: ReadonlySet<string> = new Set([
  // health
  'health', 'healthy', 'medical', 'illness', 'disease', 'sick', 'diabetes', 'diabetic', 'cancer', 'depression', 'depressed',
  'anxiety', 'anxious', 'adhd', 'autism', 'autistic', 'bipolar', 'ocd', 'ptsd', 'therapy', 'therapist', 'mental', 'pregnant',
  'pregnancy', 'disability', 'disabled', 'sober', 'sobriety', 'rehab', 'recovery', 'chronic', 'celiac', 'allergy', 'allergic',
  'weightloss', 'dieting', 'diet', 'medication', 'hiv', 'clinic', 'hospital',
  // religion
  'religion', 'religious', 'christian', 'christianity', 'catholic', 'muslim', 'islam', 'islamic', 'jewish', 'judaism', 'hindu',
  'hinduism', 'buddhist', 'buddhism', 'sikh', 'atheist', 'church', 'mosque', 'synagogue', 'cathedral', 'chapel', 'parish',
  'faith', 'prayer', 'bible', 'quran', 'spiritual', 'god', 'jesus',
  // sexuality and gender identity
  'gay', 'lesbian', 'queer', 'lgbt', 'lgbtq', 'lgbtqia', 'bisexual', 'bi', 'trans', 'transgender', 'nonbinary', 'straight',
  'pride', 'sexuality', 'sexual',
  // politics
  'politics', 'political', 'democrat', 'democratic', 'republican', 'liberal', 'conservative', 'maga', 'leftist',
  'socialist', 'communist', 'libertarian', 'activist', 'election', 'vote', 'voter',
  // ethnicity and race
  'ethnic', 'ethnicity', 'race', 'racial', 'latino', 'latina', 'latinx', 'hispanic', 'immigrant',
  // diet (only what a person states themself)
  'vegan', 'vegetarian', 'halal', 'kosher', 'keto', 'paleo', 'gluten', 'dairy', 'pescatarian',
]);

/**
 * Substrings that mark a compound hashtag or tag as sensitive ("#veganfood", "#pridemonth").
 * Kept to unambiguous stems: no "maga" (magazine), "hospital" (hospitality) or "trump" (trumpet).
 */
export const SENSITIVE_SUBSTRINGS: readonly string[] = [
  'vegan', 'vegetarian', 'glutenfree', 'halal', 'kosher', 'celiac', 'weightloss',
  'christian', 'catholic', 'muslim', 'jewish', 'hindu', 'buddhis', 'church', 'mosque', 'synagogue', 'cathedral', 'bible', 'quran', 'jesus',
  'lgbt', 'queer', 'lesbian', 'bisexual', 'transgender', 'nonbinary', 'pride',
  'democrat', 'republican', 'politic',
  'latino', 'latina', 'latinx', 'hispanic', 'ethnicity',
  'diabet', 'cancer', 'depress', 'anxiety', 'adhd', 'autis', 'bipolar', 'ptsd', 'therapy', 'mentalhealth', 'pregnan', 'disabilit',
  'sobriety', 'soberlife', 'rehab', 'chemo',
];
