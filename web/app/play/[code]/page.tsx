import { StdbProvider } from '@/lib/stdb';
import { PlayerScreen } from '@/components/play/PlayerScreen';

export default async function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <StdbProvider role="player">
      <PlayerScreen code={code.toUpperCase()} />
    </StdbProvider>
  );
}
