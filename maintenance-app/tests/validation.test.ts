import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyForm, validateForm, needsSurvey, firstErrorStep, type ItemForm } from '../src/lib/validation.ts';
import { UNKNOWN } from '../src/lib/constants.ts';
import type { Category } from '../src/lib/types.ts';

const cat: Category = {
  id: 'c1', name: '누수', default_urgency: 'urgent', units: ['개소', '㎡'], active: true, sort: 1,
  required_fields: [
    { key: 'leak_part', label: '누수 부위', type: 'select', options: ['천장', '벽'], required: true },
    { key: 'damaged_sqm', label: '훼손 면적', type: 'number', unit: '㎡', required: true, unknown: true },
  ],
};
const full = (): ItemForm => ({
  ...emptyForm(cat), area: '주차장', location_detail: '기둥 옆', symptom: '물이 샘', onset: '1주 이내', qty: '2',
  extra: { leak_part: '천장', damaged_sqm: '1.5' },
  photos: [{ kind: 'wide', path: 'a' }, { kind: 'close', path: 'b' }],
  work_when: 'anytime', high_place: 'no', quarter: 'q2',
});

test('빈 폼은 모든 필수 항목 오류를 낸다', () => {
  const e = validateForm(emptyForm(cat), cat);
  for (const k of ['area', 'location_detail', 'symptom', 'onset', 'qty', 'photos', 'work_when', 'high_place', 'quarter', 'extra.leak_part'])
    assert.ok(e[k], `${k} 오류 필요`);
  assert.equal(firstErrorStep(e, cat), 0);
});

test('모든 필수 항목을 채우면 통과한다', () => assert.deepEqual(validateForm(full(), cat), {}));

test('사진은 2장 미만이면 막힌다', () => {
  const f = full(); f.photos = [f.photos[0]];
  assert.ok(validateForm(f, cat).photos);
});

test('수량 모름 선택 시 수량 없이 통과하고 실사 필요가 켜진다', () => {
  const f = full(); f.qty = ''; f.qty_unknown = true;
  assert.deepEqual(validateForm(f, cat), {});
  assert.equal(needsSurvey(f), true);
});

test('모름 허용 항목만 모름을 선택할 수 있다', () => {
  const f = full(); f.extra.damaged_sqm = UNKNOWN;
  assert.deepEqual(validateForm(f, cat), {});
  assert.equal(needsSurvey(f), true);
  f.extra.leak_part = UNKNOWN;
  assert.ok(validateForm(f, cat)['extra.leak_part']);
});

test('수량은 0 이하·숫자가 아닌 값을 거부한다', () => {
  for (const v of ['0', '-1', 'abc']) { const f = full(); f.qty = v; assert.ok(validateForm(f, cat).qty, v); }
});

test('오류가 있는 첫 단계를 알려준다', () => {
  const f = full(); f.photos = [];
  assert.equal(firstErrorStep(validateForm(f, cat), cat), 2);
});
