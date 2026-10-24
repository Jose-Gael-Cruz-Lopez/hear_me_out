import { Route, Switch } from 'wouter';
import { useSpacetimeDB } from 'spacetimedb/react';
import { Toaster } from './lib/toast';
import { Home } from './pages/Home';
import { Lobbies } from './pages/Lobbies';
import { Meet } from './pages/Meet';
import { HostScreen } from './host/HostScreen';
import { PlayScreen } from './play/PlayScreen';
import { RoomGate } from './components/RoomGate';

function ConnectionBadge() {
  const { isActive } = useSpacetimeDB();
  if (isActive) return null;
  return <div className="fixed top-3 left-1/2 z-50 -translate-x-1/2 chip bg-tang text-ink">Connecting to the courthouse…</div>;
}

export function App() {
  return (
    <>
      <ConnectionBadge />
      <Switch>
        <Route path="/host/:code">{p => <RoomGate code={p.code} withMedia>{() => <HostScreen />}</RoomGate>}</Route>
        <Route path="/play/:code">{p => <RoomGate code={p.code} withMedia={false}>{() => <PlayScreen />}</RoomGate>}</Route>
        <Route path="/lobbies" component={Lobbies} />
        <Route path="/meet" component={Meet} />
        <Route component={Home} />
      </Switch>
      <Toaster />
    </>
  );
}
