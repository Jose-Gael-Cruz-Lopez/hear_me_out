// No I or O, so codes are easy to read off a TV across the room.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const BLOCKED = new Set(['FUCK', 'SHIT', 'CUNT', 'COCK', 'DICK', 'PISS', 'TWAT', 'SLUT', 'WANK', 'FAGS', 'NAZI', 'RAPE']);

/** `randInt(n)` returns an integer in [0, n). */
export function makeRoomCode(randInt: (n: number) => number): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += ALPHABET[randInt(ALPHABET.length)];
    if (!BLOCKED.has(code)) return code;
  }
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}
