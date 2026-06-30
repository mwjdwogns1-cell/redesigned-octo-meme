'use client';

import { Rule } from '@/lib/rules';

type CheckState = true | false | undefined;

const CAT_ACCENT: Record<string, string> = {
  morning: 'border-l-amber-400',
  lunch: 'border-l-sky-400',
  sugar: 'border-l-rose-500',
  dinnerIF: 'border-l-violet-400',
  closing: 'border-l-emerald-400',
  drinking: 'border-l-red-500',
};

function statusUI(v: CheckState) {
  if (v === true) return { icon: '✅', label: '지킴', cls: 'bg-emerald-600 text-white' };
  if (v === false) return { icon: '❌', label: '어김', cls: 'bg-rose-600 text-white' };
  return { icon: '⬜', label: '미체크', cls: 'bg-panel2 text-slate-300' };
}

export function RuleCard({
  rule,
  value,
  onToggle,
}: {
  rule: Rule;
  value: CheckState;
  onToggle: () => void;
}) {
  const accent = CAT_ACCENT[rule.category] ?? 'border-l-slate-500';
  const s = statusUI(value);

  return (
    <button
      onClick={onToggle}
      className={`w-full text-left rounded-2xl bg-panel border-l-4 ${accent} p-4 active:scale-[0.99] transition`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold tabular-nums">{rule.time}</span>
          <span className="text-sm text-slate-400">{rule.label}</span>
          {rule.keyMetric && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">
              핵심
            </span>
          )}
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${s.cls}`}>
          {s.icon} {s.label}
        </span>
      </div>
      <p className="mt-2 text-[15px] leading-snug text-slate-100">{rule.message}</p>
    </button>
  );
}
