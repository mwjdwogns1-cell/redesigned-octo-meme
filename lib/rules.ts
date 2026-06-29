// 규칙(룰) 정의 + 기본 시드 데이터.
// 사용자의 실제 규칙 문구/시각을 그대로 사용한다. (변경 금지)

export type RuleCategory =
  | 'morning'
  | 'lunch'
  | 'sugar'
  | 'dinnerIF'
  | 'closing'
  | 'drinking';

export interface Rule {
  id: string;
  /** "HH:MM" 24h. 수동 트리거(술자리)는 null */
  time: string | null;
  category: RuleCategory;
  label: string; // 분류 한글 라벨
  message: string; // 알림 문구 (그대로 사용)
  /** 평일 당류 0 핵심 추적 지표 여부 */
  keyMetric?: boolean;
  /** true면 정시 알림이 아닌 수동 트리거 버튼 */
  manual?: boolean;
}

export const SEED_RULES: Rule[] = [
  {
    id: 'morning',
    time: '08:00',
    category: 'morning',
    label: '아침',
    message: '단백질 + 익힌 양배추로. 과일은 곁들임만, 탄수 진입 차단.',
  },
  {
    id: 'lunch',
    time: '12:30',
    category: 'lunch',
    label: '점심',
    message: '한식 OK. 밥은 2/3, 채소·반찬 먼저 → 밥 나중. 국물은 적게.',
  },
  {
    id: 'sugar',
    time: '15:30',
    category: 'sugar',
    label: '당류(핵심)',
    message:
      '당 갈망 시간. "약간만"은 없다. 평일 당류 0. 먹고 싶으면 토요일로 미뤄라.',
    keyMetric: true,
  },
  {
    id: 'dinnerIF',
    time: '19:00',
    category: 'dinnerIF',
    label: '저녁 IF',
    message: '저녁 금식 유지. 1년 10kg 뺀 검증된 무기다.',
  },
  {
    id: 'closing',
    time: '21:00',
    category: 'closing',
    label: '마감',
    message: '오늘 체크인 했나? streak 끊지 마라.',
  },
  {
    id: 'drinking',
    time: null,
    category: 'drinking',
    label: '술자리',
    message:
      '마무리 탄수(밥·면·튀김·디저트) 0순위 차단. 술 한 잔 = 물 한 잔. 안주는 단백질·채소.',
    manual: true,
  },
];

/** 정시 알림 대상 룰 (수동 제외, time 있는 것) */
export function scheduledRules(rules: Rule[]): Rule[] {
  return rules.filter((r) => !r.manual && r.time);
}

/** 평일 당류 0 핵심 지표 룰 */
export function keyMetricRule(rules: Rule[]): Rule | undefined {
  return rules.find((r) => r.keyMetric);
}
