import { useEffect, useRef, useState } from 'react';

/** Paint a tap immediately; the server remains authoritative and failures roll back. */
export function useLiveChoice<T extends string | bigint>(authoritative: T | undefined, scope: string) {
  const [pending, setPending] = useState<{ scope: string; value: T } | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    if (pending && (pending.scope !== scope || pending.value === authoritative)) setPending(null);
  }, [authoritative, scope, pending]);
  const value = pending?.scope === scope ? pending.value : authoritative;
  const select = async (next: T, commit: () => Promise<boolean>) => {
    if (busy.current || value === next) return;
    busy.current = true;
    setSaving(true);
    setPending({ scope, value: next });
    try {
      if (!(await commit())) setPending(null);
    } catch {
      setPending(null);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  return { value, saving, select };
}
