'use client';

import { useApp } from '@/hooks/useApp';
import { scheduledRules } from '@/lib/rules';
import { korDayLabel, isSaturday, parseKey } from '@/lib/date';
import { RuleCard } from '@/components/RuleCard';
import { StreakCard } from '@/components/StreakCard';
import { CheatCounter } from '@/components/CheatCounter';
import { DrinkButton } from '@/components/DrinkButton';
import { NotificationManager } from '@/components/NotificationManager';

export default function Home() {
  const app = useApp();

  if (!app.ready || !app.state || !app.derived) {
    return (
      <main className="mx-auto max-w-md p-4">
        <div className="h-40 animate-pulse rounded-2xl bg-panel" />
      </main>
    );
  }

  const { state, today, derived } = app;
  const todayDate = parseKey(today);
  const sat = isSaturday(todayDate);
  const drinkRule = state.rules.find((r) => r.manual);
  const todayMap = state.checkins[today] ?? {};
  const usedToday = state.cheatDays.includes(today);

  return (
    <main className="mx-auto max-w-md p-4 pb-16 space-y-4">
      {/* ① 날짜 / 요일 */}
      <header className="pt-2">
        <div className="text-sm text-slate-400">오늘</div>
        <h1 className="text-2xl font-bold">
          {today}{' '}
          <span className={sat ? 'text-amber-400' : 'text-slate-300'}>
            ({korDayLabel(todayDate)})
          </span>
        </h1>
      </header>

      {/* 알림 권한/안내 */}
      <NotificationManager
        rules={state.rules}
        notificationsEnabled={state.settings.notificationsEnabled}
        onEnableChange={app.setNotificationsEnabled}
      />

      {/* ③ streak (크게) */}
      <StreakCard streak={derived.streak} weekly={derived.weekly} />

      {/* ⑤ 술자리 빨간 버튼 */}
      {drinkRule && <DrinkButton rule={drinkRule} />}

      {/* ④ 치팅 카운터 */}
      <CheatCounter
        remaining={derived.cheatRemaining}
        used={derived.cheatUsed}
        allowance={derived.cheatAllowance}
        isSaturday={sat}
        usedToday={usedToday}
        onToggle={app.toggleCheat}
      />

      {/* ② 시간대별 룰 카드 (체크 가능) */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-400 px-1">오늘 할 일 · 탭하여 체크</h2>
        {scheduledRules(state.rules).map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            value={todayMap[rule.id]}
            onToggle={() => app.toggleRule(rule.id)}
          />
        ))}
      </section>

      {/* 알림 한계 안내 */}
      <footer className="rounded-xl bg-panel/60 p-3 text-xs leading-relaxed text-slate-500">
        ⚠️ 정시 알림은 앱(탭/PWA)이 열려 있을 때 동작합니다. 앱이 완전히 종료되면 OS가
        알림을 누락할 수 있어요. 꼭 챙겨야 하는 시각은 휴대폰 기본 알람을 함께 맞춰두는
        것을 권합니다.
      </footer>
    </main>
  );
}
