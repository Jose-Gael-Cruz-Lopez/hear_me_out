// The phone player app's shell pieces (mobile design from export/): a scrolling body and a primary
// action pinned in thumb reach at the bottom. Pure layout: screens keep their own logic.
import type { ReactNode } from 'react';

export function MScreen({ children, action, center = false }: { children: ReactNode; action?: ReactNode; center?: boolean }) {
  return (
    <div className="m-screen">
      <div className={`m-body ${center ? 'm-center' : ''}`}>{children}</div>
      {action && <div className="m-action">{action}</div>}
    </div>
  );
}

export function MHead({ kicker, title, sub, icon }: { kicker?: ReactNode; title: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="m-head">
      {kicker && (
        <div className="m-kicker">
          {icon}
          {kicker}
        </div>
      )}
      <h1 className="m-h1">{title}</h1>
      {sub && <p className="m-sub">{sub}</p>}
    </div>
  );
}

/** A quiet status line for the action bar when the game, not the player, moves things on. */
export function MStatus({ children, live = false }: { children: ReactNode; live?: boolean }) {
  return (
    <div className="m-status">
      {live && <span className="m-live" />}
      {children}
    </div>
  );
}
