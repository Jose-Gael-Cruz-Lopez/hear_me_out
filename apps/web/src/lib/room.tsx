import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import {
  tables,
  type Assignment,
  type Award,
  type DbConnection,
  type Media,
  type MergeOffer,
  type MergeVote,
  type Objection,
  type Option,
  type Pitch,
  type Plan,
  type Player,
  type ProfileDraft,
  type ProfilePublic,
  type Room,
  type Rsvp,
  type Vote,
  type Warmup,
} from '@hmo/bindings';
import { toast } from './toast';

export function useRoomByCode(code: string): { room: Room | undefined; ready: boolean } {
  const [rooms, ready] = useTable(tables.room.where(r => r.code.eq(code.toUpperCase())));
  return { room: rooms[0], ready };
}

export interface RoomData {
  room: Room;
  players: Player[];
  profiles: Map<bigint, ProfilePublic>;
  options: Option[];
  assignments: Assignment[];
  pitches: Pitch[];
  playable: Pitch[];
  warmups: Warmup[];
  votes: Vote[];
  awards: Award[];
  plan: Plan | undefined;
  rsvps: Rsvp[];
  objections: Objection[];
  media: Map<bigint, Media>;
  me: Player | undefined;
  myDraft: ProfileDraft | undefined;
  myPrevoteOptionId: bigint | undefined;
  mergeOffers: MergeOffer[];
  mergeVotes: MergeVote[];
  playerById: (id: bigint) => Player | undefined;
  optionById: (id: bigint) => Option | undefined;
}

const RoomContext = createContext<RoomData | null>(null);

export function useRoom(): RoomData {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error('useRoom outside RoomDataProvider');
  return ctx;
}

/** One set of room-scoped subscriptions per screen; components read from context. */
export function RoomDataProvider({ room, withMedia, children }: { room: Room; withMedia: boolean; children: ReactNode }) {
  const id = room.id;
  const { identity } = useSpacetimeDB();
  const [players] = useTable(tables.player.where(p => p.roomId.eq(id)));
  const [profiles] = useTable(tables.profilePublic.where(p => p.roomId.eq(id)));
  const [options] = useTable(tables.option.where(o => o.roomId.eq(id)));
  const [assignments] = useTable(tables.assignment.where(a => a.roomId.eq(id)));
  const [pitches] = useTable(tables.pitch.where(p => p.roomId.eq(id)));
  const [warmups] = useTable(tables.warmup.where(w => w.roomId.eq(id)));
  const [votes] = useTable(tables.vote.where(v => v.roomId.eq(id)));
  const [awards] = useTable(tables.award.where(a => a.roomId.eq(id)));
  const [plans] = useTable(tables.plan.where(p => p.roomId.eq(id)));
  const [rsvps] = useTable(tables.rsvp.where(r => r.roomId.eq(id)));
  const [objections] = useTable(tables.objection.where(o => o.roomId.eq(id)));
  // The TV gets all of a room's media (pitch audio + poster); player windows only download the poster.
  const [allMedia] = useTable(tables.media.where(m => m.roomId.eq(id)), { enabled: withMedia });
  const [posterMedia] = useTable(tables.media.where(m => m.roomId.eq(id).and(m.kind.eq('poster'))), { enabled: !withMedia });
  const media = withMedia ? allMedia : posterMedia;
  const [mergeOffers] = useTable(tables.mergeOffer.where(o => o.roomA.eq(id).or(o.roomB.eq(id))));
  const [mergeVotes] = useTable(tables.mergeVote);
  const [drafts] = useTable(tables.myProfileDraft);
  const [prevotes] = useTable(tables.myPrevote);

  const value = useMemo<RoomData>(() => {
    const sortedPlayers = [...players].sort((a, b) => a.seat - b.seat);
    const sortedOptions = [...options].sort((a, b) => a.sortOrder - b.sortOrder);
    const sortedPitches = [...pitches].sort((a, b) => a.playOrder - b.playOrder);
    const me = identity ? sortedPlayers.find(p => !p.isBot && p.identity.isEqual(identity)) : undefined;
    return {
      room,
      players: sortedPlayers,
      profiles: new Map(profiles.map(p => [p.playerId, p])),
      options: sortedOptions,
      assignments: [...assignments],
      pitches: sortedPitches,
      playable: sortedPitches.filter(p => p.status !== 'waiting' && p.status !== 'skipped'),
      warmups: [...warmups],
      votes: [...votes],
      awards: [...awards],
      plan: plans[0],
      rsvps: [...rsvps],
      objections: [...objections],
      media: new Map(media.map(m => [m.id, m])),
      me,
      myDraft: me ? drafts.find(d => d.playerId === me.id) : undefined,
      myPrevoteOptionId: me ? prevotes.find(p => p.playerId === me.id)?.optionId : undefined,
      mergeOffers: [...mergeOffers].sort((a, b) => Number(b.id - a.id)),
      mergeVotes: mergeVotes.filter(v => mergeOffers.some(o => o.id === v.offerId)),
      playerById: (pid: bigint) => sortedPlayers.find(p => p.id === pid),
      optionById: (oid: bigint) => sortedOptions.find(o => o.id === oid),
    };
  }, [room, players, profiles, options, assignments, pitches, warmups, votes, awards, plans, rsvps, objections, media, drafts, prevotes, mergeOffers, mergeVotes, identity]);

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

/** Turn "SenderError: You already objected." into "You already objected." */
export function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/^(Error:\s*)?(SenderError:\s*)?/i, '').replace(/^.*?SenderError:\s*/i, '') || 'Something went wrong';
}

/** Reducer calls with error toasts. Resolves true when the reducer committed. */
export function useCall() {
  const { getConnection } = useSpacetimeDB();
  return useCallback(
    async (fn: (conn: DbConnection) => Promise<unknown>, opts: { silent?: boolean } = {}): Promise<boolean> => {
      const conn = getConnection() as DbConnection | null;
      if (!conn) {
        toast('Not connected yet, one sec…');
        return false;
      }
      try {
        await fn(conn);
        return true;
      } catch (err) {
        if (!opts.silent) toast(errorMessage(err));
        return false;
      }
    },
    [getConnection]
  );
}
