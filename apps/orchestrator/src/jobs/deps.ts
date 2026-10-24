import type { Option, Player, ProfilePublic, Room } from '@hmo/bindings';
import type { Config } from '../config';
import type { Muse } from '../services/muse';
import type { Member } from '../services/curation';
import type { FixtureArea } from '../services/venues';
import type { Conn } from '../stdb';

export interface Deps {
  cfg: Config;
  conn: Conn;
  muse: Muse;
  fixtures: FixtureArea[];
}

export function roomOf(conn: Conn, roomId: bigint): Room | undefined {
  return conn.db.room.id.find(roomId) ?? undefined;
}

export function playersOf(conn: Conn, roomId: bigint): Player[] {
  return [...conn.db.player.iter()].filter(p => p.roomId === roomId).sort((a, b) => a.seat - b.seat);
}

export function optionsOf(conn: Conn, roomId: bigint): Option[] {
  return [...conn.db.option.iter()].filter(o => o.roomId === roomId).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function profileOf(conn: Conn, playerId: bigint): ProfilePublic | undefined {
  return conn.db.profilePublic.playerId.find(playerId) ?? undefined;
}

export function membersOf(conn: Conn, roomId: bigint): Member[] {
  return playersOf(conn, roomId).map(p => {
    const prof = profileOf(conn, p.id);
    return {
      playerId: p.id,
      name: p.name,
      budgetMax: prof?.budgetMax ?? 2,
      dietary: prof?.dietary ?? [],
      maxTravelMin: prof?.maxTravelMin ?? 30,
      windows: prof?.availability ?? [],
      tags: prof?.approvedTags ?? [],
    };
  });
}
