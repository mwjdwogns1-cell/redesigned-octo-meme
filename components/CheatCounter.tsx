'use client';

export function CheatCounter({
  remaining,
  used,
  allowance,
  isSaturday,
  usedToday,
  onToggle,
}: {
  remaining: number;
  used: number;
  allowance: number;
  isSaturday: boolean;
  usedToday: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-2xl bg-panel p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-400">이번 주 치팅</div>
          <div className="mt-0.5 text-2xl font-bold">
            남은 <span className="text-amber-400 tabular-nums">{remaining}</span>
            <span className="text-slate-500 text-base"> / {allowance}회</span>
          </div>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: allowance }).map((_, i) => (
            <span
              key={i}
              className={`h-8 w-8 rounded-full grid place-items-center text-lg ${
                i < used ? 'bg-amber-500/20' : 'bg-panel2'
              }`}
            >
              {i < used ? '🍰' : '◻️'}
            </span>
          ))}
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        평일 충동은 “금지”가 아니라 토요일로 연기. 치팅은 토요일 1회.
      </p>

      <button
        onClick={onToggle}
        disabled={!isSaturday && !usedToday}
        className={`mt-3 w-full rounded-xl py-2.5 font-semibold transition ${
          usedToday
            ? 'bg-amber-600 text-white'
            : isSaturday
            ? 'bg-amber-500/15 text-amber-300 active:bg-amber-500/25'
            : 'bg-panel2 text-slate-600 cursor-not-allowed'
        }`}
      >
        {usedToday
          ? '오늘 치팅 사용함 (취소하려면 탭)'
          : isSaturday
          ? '오늘 치팅 사용'
          : '토요일에만 사용 가능'}
      </button>
    </div>
  );
}
