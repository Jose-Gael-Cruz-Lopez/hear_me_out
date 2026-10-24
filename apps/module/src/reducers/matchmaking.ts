import { SenderError, t } from 'spacetimedb/server';
import spacetimedb from '../schema';
import { addPlayer } from '../players';
import { insertRoom } from '../queue';
import { clampText } from '../logic/text';

/**
 * "Find my people": join the matchmaking queue for a category. The queue is a lobby where you build
 * your profile (Bring your Muse, socials) and approve your tags; the matcher then moves you into a
 * game with strangers who share your vibe.
 */
export const joinMatchmaking = spacetimedb.reducer(
  { category: t.string(), locationLabel: t.string(), tzOffsetMin: t.i32(), name: t.string(), avatar: t.string(), confirmed18: t.bool(), fastMode: t.bool() },
  (ctx, a) => {
    if (!a.confirmed18) throw new SenderError('Meeting new people is 18+ only.');
    if (!['food', 'activity', 'movie'].includes(a.category)) throw new SenderError('Pick food, activity or movie.');
    let q = [...ctx.db.room.iter()].find(r => r.mode === 'queue' && r.category === a.category && r.fastMode === a.fastMode);
    q ??= insertRoom(ctx, {
      mode: 'queue',
      category: a.category,
      locationLabel: clampText(a.locationLabel, 120),
      tzOffsetMin: Math.max(-840, Math.min(840, a.tzOffsetMin)),
      fastMode: a.fastMode,
      isPublic: false,
    });
    addPlayer(ctx, q.code, a.name, a.avatar, true);
  }
);
