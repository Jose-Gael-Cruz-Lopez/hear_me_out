'use client';

// SpacetimeDB connection + a single hook that exposes one lobby's live game board.
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { SpacetimeDBProvider, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { DbConnection, tables } from '@/src/module_bindings';

export const DB_NAME = process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME || 'pitch-fight';

/** Explicit env wins; otherwise talk to SpacetimeDB on :3000 of whatever host served this page (works on LAN). */
export function spacetimeUri() {
  if (process.env.NEXT_PUBLIC_SPACETIMEDB_HOST) return process.env.NEXT_PUBLIC_SPACETIMEDB_HOST;
  if (typeof window === 'undefined') return 'ws://localhost:3000';
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.hostname}:3000`;
}

/**
 * The big screen and the phone controller get separate identities (separate tokens), so one laptop
 * can host and play. Add ?seat=2 to a URL to simulate another phone in a new tab while developing.
 */
function tokenKey(role: 'host' | 'player') {
  const seat = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('seat') ?? '';
  return `pitchfight:${spacetimeUri()}/${DB_NAME}/${role}${seat ? `:${seat}` : ''}`;
}

function readToken(key: string) {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

export function StdbProvider({ role, children }: { role: 'host' | 'player'; children: ReactNode }) {
  const builder = useMemo(() => {
    const key = tokenKey(role);
    return DbConnection.builder()
      .withUri(spacetimeUri())
      .withDatabaseName(DB_NAME)
      .withToken(readToken(key))
      .onConnect((_c, _id, token) => {
        try {
          localStorage.setItem(key, token);
        } catch {}
      })
      .onConnectError((_ctx, err) => console.error('SpacetimeDB connect error', err));
  }, [role]);
  return <SpacetimeDBProvider connectionBuilder={builder}>{children}</SpacetimeDBProvider>;
}

export function useConn() {
  const state = useSpacetimeDB();
  return { ...state, conn: state.getConnection() as DbConnection | null };
}

export function useGame(rawCode: string) {
  const code = rawCode.toUpperCase();
  const { conn, identity, isActive } = useConn();
  const [lobbies, lobbyReady] = useTable(tables.lobby.where(r => r.code.eq(code)));
  const [players, playersReady] = useTable(tables.player.where(r => r.lobbyCode.eq(code)));
  const [profiles] = useTable(tables.profile.where(r => r.lobbyCode.eq(code)));
  const [optionRows] = useTable(tables.option.where(r => r.lobbyCode.eq(code)));
  const [assignmentRows] = useTable(tables.assignment.where(r => r.lobbyCode.eq(code)));
  const [pitches] = useTable(tables.pitch.where(r => r.lobbyCode.eq(code)));
  const [votes] = useTable(tables.vote.where(r => r.lobbyCode.eq(code)));
  const [plans] = useTable(tables.plan.where(r => r.lobbyCode.eq(code)));
  const [rsvps] = useTable(tables.rsvp.where(r => r.lobbyCode.eq(code)));

  const lobby = lobbies[0];
  const sortedPlayers = useMemo(() => [...players].sort((a, b) => Number(a.id - b.id)), [players]);
  const options = useMemo(() => [...optionRows].sort((a, b) => a.slot - b.slot), [optionRows]);
  const assignments = useMemo(() => [...assignmentRows].sort((a, b) => a.order - b.order), [assignmentRows]);
  // Bots share the host's identity, so they are never "me".
  const me = identity ? sortedPlayers.find(p => !p.isBot && p.identity.isEqual(identity)) : undefined;
  const isHost = !!(identity && lobby?.host.isEqual(identity));

  return {
    code,
    conn,
    identity,
    connected: isActive,
    ready: lobbyReady && playersReady,
    lobby,
    phase: lobby?.phase ?? '',
    players: sortedPlayers,
    profiles,
    options,
    assignments,
    pitches,
    votes,
    plan: plans[0],
    rsvps,
    me,
    isHost,
  };
}

export type Game = ReturnType<typeof useGame>;

/** True once the board has loaded at least once, so a later network blip shows a banner instead of a blank screen. */
export function useLoadedOnce(ready: boolean) {
  const [loaded, setLoaded] = useState(false);
  if (ready && !loaded) setLoaded(true);
  return loaded;
}

/** Wraps a reducer call: tracks busy state and surfaces the server's rule-violation message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}
