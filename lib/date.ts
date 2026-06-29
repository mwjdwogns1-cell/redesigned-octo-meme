// 날짜/요일 유틸. 로컬 타임존 기준으로 동작한다.
// 자정 롤오버는 "오늘 날짜키"가 바뀌는 것으로 자연스럽게 처리된다.

const KOR_DAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 로컬 기준 YYYY-MM-DD */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 0=일 ... 6=토 */
export function weekdayNum(d: Date = new Date()): number {
  return d.getDay();
}

export function korDayLabel(d: Date = new Date()): string {
  return KOR_DAYS[d.getDay()];
}

/** 월~금 */
export function isWeekday(d: Date = new Date()): boolean {
  const n = d.getDay();
  return n >= 1 && n <= 5;
}

/** 토요일 (치팅 허용일) */
export function isSaturday(d: Date = new Date()): boolean {
  return d.getDay() === 6;
}

/** 해당 날짜가 속한 주의 월요일(주 시작) 날짜키.
 *  월요일 시작 기준으로 주간 통계/치팅을 계산한다. */
export function weekStartKey(d: Date = new Date()): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = copy.getDay(); // 0=일
  const diff = day === 0 ? 6 : day - 1; // 월요일까지 거슬러 갈 일수
  copy.setDate(copy.getDate() - diff);
  return dateKey(copy);
}

/** 이번 주(월~일) 7일의 날짜키 배열 */
export function weekDays(d: Date = new Date()): string[] {
  const start = parseKey(weekStartKey(d));
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(start);
    dd.setDate(start.getDate() + i);
    return dateKey(dd);
  });
}

/** 어제 날짜키 */
export function prevKey(key: string): string {
  const d = parseKey(key);
  d.setDate(d.getDate() - 1);
  return dateKey(d);
}
