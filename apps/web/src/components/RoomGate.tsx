import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { RoomDataProvider, useRoomByCode } from '../lib/room';
import { Logo } from './ui';

export function RoomGate({ code, withMedia, children }: { code: string; withMedia: boolean; children: () => ReactNode }) {
  const { room, ready } = useRoomByCode(code);
  if (!room) {
    return (
      <div className="grid min-h-full place-items-center p-6 text-center">
        <div className="space-y-4">
          <Logo />
          <div className="text-2xl font-bold">{ready ? `No room called ${code.toUpperCase()}.` : 'Finding the room…'}</div>
          {ready && (
            <Link href="/" className="btn btn-sun">
              Back home
            </Link>
          )}
        </div>
      </div>
    );
  }
  return (
    <RoomDataProvider room={room} withMedia={withMedia}>
      {children()}
    </RoomDataProvider>
  );
}
