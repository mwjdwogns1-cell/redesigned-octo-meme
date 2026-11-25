import type { LibItem } from './types';

// 기본 라이브러리 (더미 규격, 단위 cm). 실제 규격은 [라이브러리 불러오기]로 교체.
export const DEFAULT_LIBRARY: LibItem[] = [
  { id: 'wall-panel-240', name: '벽패널 240', cat: '벽체/패널', kind: 'box', w: 240, d: 10, h: 240, color: '#f2f0ec' },
  { id: 'wall-panel-120', name: '벽패널 120', cat: '벽체/패널', kind: 'box', w: 120, d: 10, h: 240, color: '#f2f0ec' },
  { id: 'wall-panel-dark', name: '벽패널 다크 120', cat: '벽체/패널', kind: 'box', w: 120, d: 10, h: 240, color: '#3a3a3c' },
  { id: 'glass-120', name: '유리 패널 120', cat: '유리', kind: 'box', w: 120, d: 2, h: 270, color: '#a8d4f0', glass: true },
  { id: 'glass-rail-300', name: '유리 난간 300', cat: '유리', kind: 'box', w: 300, d: 2, h: 110, color: '#a8d4f0', glass: true },
  { id: 'column-sq', name: '기둥(사각)', cat: '구조물', kind: 'box', w: 60, d: 60, h: 300, color: '#9aa0a6', obstacle: true },
  { id: 'column-rd', name: '기둥(원형)', cat: '구조물', kind: 'cyl', w: 60, d: 60, h: 300, color: '#9aa0a6', obstacle: true },
  { id: 'wall-shelf-120', name: '벽면 진열장 120', cat: '집기', kind: 'box', w: 120, d: 45, h: 210, color: '#c9a77c' },
  { id: 'table-exp-180', name: '체험 테이블 180', cat: '집기', kind: 'box', w: 180, d: 90, h: 90, color: '#d8c3a0' },
  { id: 'table-consult', name: '상담 테이블', cat: '집기', kind: 'box', w: 150, d: 90, h: 75, color: '#d8c3a0' },
  { id: 'showcase-50', name: '쇼케이스 50', cat: '집기', kind: 'box', w: 50, d: 50, h: 130, color: '#e6e6e6' },
  { id: 'sofa-240', name: '소파 240', cat: '집기', kind: 'box', w: 240, d: 90, h: 70, color: '#7a2e35' },
  { id: 'display-65', name: '디스플레이 65"', cat: '디스플레이', kind: 'box', w: 145, d: 5, h: 83, color: '#111111', y0: 110 },
  { id: 'display-85', name: '디스플레이 85"', cat: '디스플레이', kind: 'box', w: 190, d: 5, h: 109, color: '#111111', y0: 100 },
  { id: 'fridge-90', name: '냉장고형 박스 90', cat: '가전(박스)', kind: 'box', w: 90, d: 90, h: 185, color: '#d9dcdf' },
  { id: 'washer-70', name: '세탁기형 박스 70', cat: '가전(박스)', kind: 'box', w: 70, d: 90, h: 100, color: '#d9dcdf' },
];
