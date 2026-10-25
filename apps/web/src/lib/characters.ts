export type CharacterLook = 'plain' | 'hat' | 'shirt';
/** One appearance key for the picker, portraits and the actual 3D crowd. */
export function characterLook(value: string): CharacterLook {
  let seed = 0;
  for (const char of value) seed = (seed * 31 + char.codePointAt(0)!) >>> 0;
  return (['plain', 'hat', 'shirt'] as const)[seed % 3];
}
