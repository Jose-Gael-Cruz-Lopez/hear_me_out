// Keep the server's existing reaction values; only the audience controls change.
export const PITCH_REACTIONS = [
  { emoji: '😂', label: 'Funny' },
  { emoji: '🔥', label: 'Good point' },
  { emoji: '🤔', label: 'Not convinced' },
] as const;

const LEGACY_LABELS: Record<string, string> = {
  '🧑‍⚖️': 'Judge',
  '🍜': 'Noodles',
  '👏': 'Applause',
  '😱': 'Surprise',
  '💯': 'Perfect',
};

export function reactionLabel(emoji: string): string {
  return PITCH_REACTIONS.find(reaction => reaction.emoji === emoji)?.label ?? LEGACY_LABELS[emoji] ?? 'Reaction';
}
