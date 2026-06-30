'use client';

import { WeeklyStats } from '@/lib/streak';

export function StreakCard({
  streak,
  weekly,
}: {
  streak: number;
  weekly: WeeklyStats;
}) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-rose-600/30 to-panel p-5 border border-rose-500/20">
      <div className="text-sm text-rose-200">평일 당류 0 연속</div>
      <div className="mt-1 flex items-end gap-2">
        <span className="text-6xl font-black leading-none tabular-nums">{streak}</span>
        <span className="mb-1 text-xl text-slate-300">일 🔥</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-center">
        <div className="rounded-xl bg-panel2/70 p-3">
          <div className="text-2xl font-bold tabular-nums">{weekly.rate}%</div>
          <div className="text-xs text-slate-400">이번 주 달성률</div>
        </div>
        <div className="rounded-xl bg-panel2/70 p-3">
          <div className="text-2xl font-bold tabular-nums">
            {weekly.keyKept}/{weekly.keyTotal}
          </div>
          <div className="text-xs text-slate-400">평일 당류 0 (이번 주)</div>
        </div>
      </div>
    </div>
  );
}
