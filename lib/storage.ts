// localStorage 영속화. 백엔드/DB 없음. 단일 사용자.
// 첫 실행 시 기본 룰 시드 주입.

import { Rule, SEED_RULES } from './rules';
import { dateKey, weekDays } from './date';

const STORAGE_KEY = 'diet-reminder/v1';

/** 주 1회 치팅 허용량 */
export const WEEKLY_CHEAT_ALLOWANCE = 1;

export interface AppState {
  version: 1;
  rules: Rule[];
  /** dateKey -> { ruleId -> 지킴(true)/어김(false) }. 미체크는 키 없음 */
  checkins: Record<string, Record<string, boolean>>;
  /** 치팅 사용한 날짜키 목록 (토요일에 사용) */
  cheatDays: string[];
  settings: {
    notificationsEnabled: boolean; // 사용자가 앱 내 알림 토글을 켰는지
  };
}

function seed(): AppState {
  return {
    version: 1,
    rules: SEED_RULES,
    checkins: {},
    cheatDays: [],
    settings: { notificationsEnabled: false },
  };
}

export function loadState(): AppState {
  if (typeof window === 'undefined') return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const s = seed();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      return s;
    }
    const parsed = JSON.parse(raw) as Partial<AppState>;
    // 방어적 병합: 누락 필드 보강 + 룰 시드 보정
    return {
      version: 1,
      rules: parsed.rules && parsed.rules.length ? parsed.rules : SEED_RULES,
      checkins: parsed.checkins ?? {},
      cheatDays: parsed.cheatDays ?? [],
      settings: {
        notificationsEnabled: parsed.settings?.notificationsEnabled ?? false,
      },
    };
  } catch {
    return seed();
  }
}

export function saveState(state: AppState): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---- 체크인 조작 ----

/** 룰 체크 상태 토글: 미체크 → 지킴(true) → 어김(false) → 미체크 */
export function cycleCheckin(
  state: AppState,
  ruleId: string,
  day: string = dateKey()
): AppState {
  const dayMap = { ...(state.checkins[day] ?? {}) };
  const cur = dayMap[ruleId];
  if (cur === undefined) dayMap[ruleId] = true;
  else if (cur === true) dayMap[ruleId] = false;
  else delete dayMap[ruleId];
  return { ...state, checkins: { ...state.checkins, [day]: dayMap } };
}

// ---- 치팅 조작 ----

export function cheatsUsedThisWeek(state: AppState, ref: Date = new Date()): number {
  const days = new Set(weekDays(ref));
  return state.cheatDays.filter((d) => days.has(d)).length;
}

export function cheatsRemaining(state: AppState, ref: Date = new Date()): number {
  return Math.max(0, WEEKLY_CHEAT_ALLOWANCE - cheatsUsedThisWeek(state, ref));
}

/** 오늘 치팅 사용/취소 토글 */
export function toggleCheatToday(state: AppState): AppState {
  const today = dateKey();
  const has = state.cheatDays.includes(today);
  const cheatDays = has
    ? state.cheatDays.filter((d) => d !== today)
    : [...state.cheatDays, today];
  return { ...state, cheatDays };
}
