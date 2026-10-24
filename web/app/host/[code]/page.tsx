import { StdbProvider } from '@/lib/stdb';
import { HostScreen } from '@/components/host/HostScreen';

export default async function HostPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <StdbProvider role="host">
      <HostScreen code={code.toUpperCase()} />
    </StdbProvider>
  );
}
