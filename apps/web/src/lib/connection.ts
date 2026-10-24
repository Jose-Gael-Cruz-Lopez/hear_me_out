import { DbConnection } from '@hmo/bindings';

export const STDB_URI = import.meta.env.VITE_SPACETIMEDB_URI as string;
export const STDB_DB = import.meta.env.VITE_SPACETIMEDB_DB_NAME as string;
export const DEMO_LOCATION = (import.meta.env.VITE_DEMO_LOCATION as string) || '';

// sessionStorage, not localStorage: every tab is its own player, so one Mac can seat several people.
// A reload keeps the same identity (sessionStorage survives reloads within the tab).
const TOKEN_KEY = `hmo:${STDB_URI}/${STDB_DB}:token`;

function readToken(): string | undefined {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export const connectionBuilder = DbConnection.builder()
  .withUri(STDB_URI)
  .withDatabaseName(STDB_DB)
  .withToken(readToken())
  .withAutomaticReconnect()
  .onConnect((_conn, _identity, token) => {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* private mode: identity just won't survive a reload */
    }
  });
