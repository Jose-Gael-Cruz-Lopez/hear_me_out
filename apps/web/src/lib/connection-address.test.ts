import { describe, expect, it } from 'vitest';
import { browserDatabaseUri } from './connection-address';
describe('browser database address', () => {
  it('uses the host computer address from a phone while preserving the database port', () => {
    expect(browserDatabaseUri('ws://127.0.0.1:3002', '10.1.0.235', true)).toBe('ws://10.1.0.235:3002');
  });
  it('retains localhost for local browsers', () => {
    expect(browserDatabaseUri('ws://127.0.0.1:3002', 'localhost', true)).toBe('ws://127.0.0.1:3002');
  });
  it('never rewrites a configured hosted database', () => {
    expect(browserDatabaseUri('wss://maincloud.spacetimedb.com', '10.1.0.235', true)).toBe('wss://maincloud.spacetimedb.com');
  });
  it('preserves hosted paths and trailing slashes in development', () => {
    expect(browserDatabaseUri('wss://db.example/proxy/', '10.1.0.235', true)).toBe('wss://db.example/proxy/');
  });
  it('keeps production configuration exact', () => {
    expect(browserDatabaseUri('wss://db.example/game', 'my-game.example', false)).toBe('wss://db.example/game');
  });
});
