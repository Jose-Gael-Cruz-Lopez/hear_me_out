/** One deterministic appearance for the picker, portraits and 3D crowd. */
export function characterSeed(value: string): number {
  let seed = 0;
  for (const c of value) seed = (seed * 31 + c.codePointAt(0)!) >>> 0;
  return seed;
}

export function characterVariant(value: string): 'plain' | 'hat' | 'shirt' {
  const seed = characterSeed(value);
  return seed % 4 === 0 ? 'hat' : seed % 3 === 1 ? 'shirt' : 'plain';
}
