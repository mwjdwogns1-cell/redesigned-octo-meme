'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  loadState,
  saveState,
  cycleCheckin,
  toggleCheatToday,
  cheatsRemaining,
  cheatsUsedThisWeek,
  WEEKLY_CHEAT_ALLOWANCE,
} from '@/lib/storage';
import { dateKey } from '@/lib/date';
import { weekdaySugarStreak, weeklyStats } from '@/lib/streak';

export function useApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [today, setToday] = useState<string>('');
  const stateRef = useRef<AppState | null>(null);

  // 최초 로드 (클라이언트 전용)
  useEffect(() => {
    const s = loadState();
    setState(s);
    stateRef.current = s;
    setToday(dateKey());
  }, []);

  // 자정 롤오버 감지: 날짜키가 바뀌면 today 갱신 → 오늘 체크 초기화(어제 기록은 보존됨)
  useEffect(() => {
    const id = setInterval(() => {
      const k = dateKey();
      setToday((prev) => (prev !== k ? k : prev));
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const commit = useCallback((next: AppState) => {
    stateRef.current = next;
    setState(next);
    saveState(next);
  }, []);

  const toggleRule = useCallback(
    (ruleId: string) => {
      if (!stateRef.current) return;
      commit(cycleCheckin(stateRef.current, ruleId));
    },
    [commit]
  );

  const toggleCheat = useCallback(() => {
    if (!stateRef.current) return;
    commit(toggleCheatToday(stateRef.current));
  }, [commit]);

  const setNotificationsEnabled = useCallback(
    (enabled: boolean) => {
      if (!stateRef.current) return;
      commit({
        ...stateRef.current,
        settings: { ...stateRef.current.settings, notificationsEnabled: enabled },
      });
    },
    [commit]
  );

  const ready = state !== null && today !== '';

  const derived = ready
    ? {
        streak: weekdaySugarStreak(state!),
        weekly: weeklyStats(state!),
        cheatRemaining: cheatsRemaining(state!),
        cheatUsed: cheatsUsedThisWeek(state!),
        cheatAllowance: WEEKLY_CHEAT_ALLOWANCE,
      }
    : null;

  return {
    ready,
    state,
    today,
    derived,
    toggleRule,
    toggleCheat,
    setNotificationsEnabled,
  };
}
