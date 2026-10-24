import { Link } from 'wouter';
import { Logo } from '../components/ui';

/** Strangers mode lobby browser (M6). */
export function Lobbies() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <Logo />
      <div className="card p-6 text-xl">Open meetups near you are coming soon.</div>
      <Link href="/" className="btn btn-sun">
        Back
      </Link>
    </div>
  );
}
