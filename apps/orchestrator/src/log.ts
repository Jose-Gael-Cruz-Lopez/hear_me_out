type Fields = Record<string, unknown>;

function fmt(fields?: Fields): string {
  if (!fields) return '';
  return (
    ' ' +
    Object.entries(fields)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : typeof v === 'bigint' ? v.toString() : JSON.stringify(v)}`)
      .join(' ')
  );
}

let quiet = false;
export function setQuiet(q: boolean): void {
  quiet = q;
}

export const log = {
  info(msg: string, fields?: Fields) {
    if (!quiet) console.log(`[orchestrator] ${msg}${fmt(fields)}`);
  },
  warn(msg: string, fields?: Fields) {
    console.warn(`[orchestrator] WARN ${msg}${fmt(fields)}`);
  },
  error(msg: string, fields?: Fields) {
    console.error(`[orchestrator] ERROR ${msg}${fmt(fields)}`);
  },
};
