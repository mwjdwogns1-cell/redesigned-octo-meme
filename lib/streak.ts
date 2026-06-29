// streak(연속 달성) + 주간 통계 계산.
// 핵심 지표: "평일(월~금) 당류 0" 연속 일수.

import { AppState } from './storage';
import { keyMetricRule } from './rules';
import { dateKey, isWeekday, parseKey, weekDays } from './date';

/**
 * 평일 당류 0 연속 일수.
 * - 오늘부터 과거로 거슬러 올라가며 평일만 센다 (주말은 끊지 않고 건너뜀).
 * - 평일에 "지킴(true)"이면 +1, "어김(false)"이면 중단.
 * - 기록 없음(undefined): 오늘이면 아직 미완료로 건너뜀, 과거면 중단.
 */
export function weekdaySugarStreak(state: AppState, ref: Date = new Date()): number {
  const rule = keyMetricRule(state.rules);
  if (!rule) return 0;

  let streak = 0;
  const todayKey = dateKey(ref);
  const cursor = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());

  for (let i = 0; i < 400; i++) {
    if (isWeekday(cursor)) {
      const key = dateKey(cursor);
      const v = state.checkins[key]?.[rule.id];
      if (v === true) {
        streak++;
      } else if (v === false) {
        break;
      } else {
        // 기록 없음
        if (key !== todayKey) break; // 과거 미기록 → 끊김
        // 오늘은 아직 안 했을 수 있음 → 건너뜀
      }
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export interface WeeklyStats {
  kept: number; // 지킴 수
  broken: number; // 어김 수
  recorded: number; // 기록된(체크한) 칸 수
  rate: number; // 달성률 % (kept / recorded), 기록 없으면 0
  /** 평일 당류 0을 지킨 평일 수 / 지난 평일 수 */
  keyKept: number;
  keyTotal: number;
}

/** 이번 주(월~일) 통계. 오늘까지 지난 날만 분모에 반영. */
export function weeklyStats(state: AppState, ref: Date = new Date()): WeeklyStats {
  const rule = keyMetricRule(state.rules);
  const todayKey = dateKey(ref);
  const days = weekDays(ref).filter((d) => d <= todayKey); // 미래 날짜 제외

  let kept = 0;
  let broken = 0;
  let keyKept = 0;
  let keyTotal = 0;

  for (const day of days) {
    const map = state.checkins[day] ?? {};
    for (const v of Object.values(map)) {
      if (v === true) kept++;
      else if (v === false) broken++;
    }
    if (rule && isWeekday(parseKey(day))) {
      keyTotal++;
      if (map[rule.id] === true) keyKept++;
    }
  }

  const recorded = kept + broken;
  const rate = recorded === 0 ? 0 : Math.round((kept / recorded) * 100);
  return { kept, broken, recorded, rate, keyKept, keyTotal };
}
