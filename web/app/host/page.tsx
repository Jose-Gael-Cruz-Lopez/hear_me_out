import { StdbProvider } from '@/lib/stdb';
import { CreateLobby } from '@/components/host/CreateLobby';

export default function HostStart() {
  return (
    <StdbProvider role="host">
      <CreateLobby />
    </StdbProvider>
  );
}
