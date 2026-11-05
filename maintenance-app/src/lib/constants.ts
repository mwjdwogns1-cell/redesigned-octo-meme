import type { ItemStatus, PhotoKind, Quarter, Urgency } from './types';

export const UNKNOWN = '__unknown__';
export const UNKNOWN_LABEL = '모름 - 현장 실사 필요';

export const URGENCY_LABEL: Record<Urgency, string> = { urgent: '긴급', normal: '일반', low: '여유' };
export const URGENCY_ORDER: Record<Urgency, number> = { urgent: 0, normal: 1, low: 2 };
export const QUARTER_LABEL: Record<Quarter, string> = { now: '즉시', q1: '1분기', q2: '2분기', q3: '3분기', q4: '4분기' };
export const QUARTERS: Quarter[] = ['now', 'q1', 'q2', 'q3', 'q4'];

export const STATUS_LABEL: Record<ItemStatus, string> = {
  draft: '작성중', submitted: '제출', approved: '승인', rejected: '반려', held: '보류',
};
export const STATUS_STYLE: Record<ItemStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-blue-100 text-blue-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
  held: 'bg-amber-100 text-amber-800',
};

export const AREAS = ['매장 내부', '매장 외부', '주차장', '공용부', '기타'];
export const ONSETS = ['1주 이내', '1개월 이내', '수개월', '1년 이상', '비 올 때만', '모름'];
export const WORK_WHEN: Record<string, string> = { anytime: '영업 중 가능', night: '야간만', holiday: '휴무일만' };
export const HIGH_PLACE: Record<string, string> = { yes: '필요', no: '불필요', unknown: '모름' };
export const PHOTO_KIND_LABEL: Record<PhotoKind, string> = { wide: '전경', close: '근접', scale: '크기 확인(줄자)' };
export const BAND_LABEL: Record<string, string> = { lt50: '50만 미만', '50to200': '50~200만', gt200: '200만 이상' };
export const MISSING_OPTIONS = ['위치', '현황', '범위·수량', '사진', '작업조건', '분류별 항목'];

/** 계획 연도: 환경변수 > (10월 이후면 다음 해, 아니면 올해) */
export function planYear(now = new Date()): number {
  const env = Number(process.env.NEXT_PUBLIC_PLAN_YEAR);
  if (env >= 2000) return env;
  return now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
}
