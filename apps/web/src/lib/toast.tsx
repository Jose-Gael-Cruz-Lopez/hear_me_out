import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';

type Listener = (msg: { id: number; text: string }) => void;
const listeners = new Set<Listener>();
let next = 1;

export function toast(text: string): void {
  const msg = { id: next++, text };
  for (const l of listeners) l(msg);
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; text: string }[]>([]);
  useEffect(() => {
    const l: Listener = msg => {
      setItems(xs => [...xs.slice(-2), msg]);
      setTimeout(() => setItems(xs => xs.filter(x => x.id !== msg.id)), 3500);
    };
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {items.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
            className="rounded-2xl bg-white border border-ink px-5 py-3 font-bold text-ink shadow-xl"
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
