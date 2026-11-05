import { UNKNOWN } from './constants';
import type { Category, PhotoKind, Quarter, Urgency } from './types';

export interface PhotoRef { kind: PhotoKind; path: string; dbId?: string }

export interface ItemForm {
  area: string;
  location_detail: string;
  symptom: string;
  onset: string;
  qty: string;
  unit: string;
  qty_unknown: boolean;
  extra: Record<string, string>;
  photos: PhotoRef[];
  work_when: '' | 'anytime' | 'night' | 'holiday';
  high_place: '' | 'yes' | 'no' | 'unknown';
  urgency: Urgency;
  quarter: Quarter | '';
}

export const emptyForm = (cat: Category): ItemForm => ({
  area: '', location_detail: '', symptom: '', onset: '', qty: '', unit: cat.units[0] ?? '개', qty_unknown: false,
  extra: {}, photos: [], work_when: '', high_place: '', urgency: cat.default_urgency, quarter: '',
});

/** 단계별 필드 (빈 칸 위치 표시 + 단계 이동에 사용) */
export const STEP_FIELDS = (cat: Category): string[][] => [
  ['area', 'location_detail', 'symptom', 'onset'],
  ['qty', 'unit', ...cat.required_fields.map((f) => `extra.${f.key}`)],
  ['photos'],
  ['work_when', 'high_place', 'urgency', 'quarter'],
];

export const MIN_PHOTOS = 2;

/** 필수 입력 검증. 반환: 필드키 → 오류 메시지 (비어 있으면 통과) */
export function validateForm(f: ItemForm, cat: Category): Record<string, string> {
  const e: Record<string, string> = {};
  const req = '필수 입력';
  if (!f.area) e.area = '구역을 선택하세요';
  if (!f.location_detail.trim()) e.location_detail = req;
  if (!f.symptom.trim()) e.symptom = req;
  if (!f.onset) e.onset = '발생 시기를 선택하세요';
  if (!f.qty_unknown) {
    const n = Number(f.qty);
    if (f.qty.trim() === '' || !Number.isFinite(n) || n <= 0) e.qty = '0보다 큰 숫자를 입력하거나 "모름"을 선택하세요';
    if (!f.unit) e.unit = '단위를 선택하세요';
  }
  for (const def of cat.required_fields) {
    const v = (f.extra[def.key] ?? '').trim();
    if (def.required && v === '') e[`extra.${def.key}`] = req;
    else if (v === UNKNOWN && !def.unknown) e[`extra.${def.key}`] = '이 항목은 모름을 선택할 수 없습니다';
    else if (def.type === 'number' && v !== '' && v !== UNKNOWN && !(Number(v) >= 0)) e[`extra.${def.key}`] = '숫자를 입력하세요';
  }
  if (f.photos.length < MIN_PHOTOS) e.photos = `사진 ${MIN_PHOTOS}장 이상 필요 (현재 ${f.photos.length}장)`;
  if (!f.work_when) e.work_when = '작업 조건을 선택하세요';
  if (!f.high_place) e.high_place = '고소 작업 여부를 선택하세요 (모르면 "모름")';
  if (!f.quarter) e.quarter = '희망 시기를 선택하세요';
  return e;
}

/** 실사 필요 여부: DB 트리거와 같은 규칙 */
export const needsSurvey = (f: ItemForm) => f.qty_unknown || Object.values(f.extra).includes(UNKNOWN);

/** 오류가 있는 첫 단계 인덱스 (없으면 -1) */
export function firstErrorStep(errors: Record<string, string>, cat: Category): number {
  const steps = STEP_FIELDS(cat);
  return steps.findIndex((keys) => keys.some((k) => errors[k]));
}
