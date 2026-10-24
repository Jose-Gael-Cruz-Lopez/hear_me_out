// Request/response shapes shared by the API routes and the clients that call them.
import type { GroupMember } from './game/filter';

export interface OptionsRequest {
  code: string;
  lat: number;
  lng: number;
  members: GroupMember[];
  /** Players that joined but skipped the questions still get something to defend. */
  players: { playerId: string; name: string }[];
  when: { day: number; minute: number; label: string };
}

export interface OptionOut {
  name: string;
  category: string;
  address: string;
  priceLevel: number;
  rating: number;
  distanceM: number;
  mapsUrl: string;
  blurb: string;
}

export interface OptionsResponse {
  options: OptionOut[];
  assignments: { playerId: string; optionIndex: number; prompt: string }[];
  notice: string;
  source: string;
  sample: boolean;
  ai: string;
}

export type ReactRequest =
  | { kind: 'pitch'; playerName: string; optionName: string; prompt: string; pitch: string }
  | { kind: 'orphan'; optionName: string; category: string; blurb: string; rating: number }
  | { kind: 'bot'; botName: string; optionName: string; category: string; prompt: string };

export interface PlanRequest {
  optionName: string;
  total: number;
  slots: { slot: string; label: string; count: number; startIso: string }[];
}

export interface PlanResponse {
  whenLabel: string;
  startIso: string;
  blurb: string;
  ai: string;
}
