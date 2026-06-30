'use client';

import { useState } from 'react';
import { Rule } from '@/lib/rules';
import { triggerNow } from '@/lib/notifications';

export function DrinkButton({ rule }: { rule: Rule }) {
  const [open, setOpen] = useState(false);

  async function start() {
    await triggerNow(rule);
    setOpen(true);
  }

  return (
    <div>
      <button
        onClick={start}
        className="w-full rounded-2xl bg-red-600 py-4 text-lg font-bold text-white shadow-lg shadow-red-900/40 active:scale-[0.99] transition"
      >
        🍶 술자리 시작
      </button>
      {open && (
        <div className="mt-2 rounded-xl bg-red-950/40 border border-red-500/30 p-3 text-sm text-red-100">
          {rule.message}
        </div>
      )}
    </div>
  );
}
