// 저장 포맷 (단위: cm, 바닥 중심 = 원점, X=가로, Z=세로(화면 아래가 +Z), Y=높이)
export type Pt = [number, number];

export interface Mat { preset: string; tile: number; tint: string }

export interface WallStyle {
  h?: number;        // 윗면 높이(바닥 기준)
  y0?: number;       // 아랫면 높이(바닥 기준), 없으면 0
  color?: string;
  kind?: 'glass';
  decals?: unknown[];
  [k: string]: unknown;
}

export interface Plan {
  id: string;
  name: string;
  h: number;                 // 기본 벽 높이
  walls: unknown[];
  solids: number[];          // [x1,z1,x2,z2,두께] 반복
  glass: unknown[];
  doors: unknown[];
  lines: unknown[];
  rev: number;
  wallStyle: Record<string, WallStyle>;
}

export interface Underlay { ref: string | null; visible: boolean; opacity: number; hidden: string[] }

export interface Floor {
  w: number; d: number; color: string; shape: string;
  mat: Mat; decals: unknown[];
  underlay: Underlay;
  plan: Plan;
  zones: { id: string; pts: Pt[]; mat?: Mat }[];
}

export interface Item {
  id: string;
  type: string;
  name: string;
  kind: 'model' | 'box' | 'cyl';
  w: number; d: number; h: number;
  color: string;
  x: number; z: number; rot: number;   // rot: 도(°), Y축 회전
  y0?: number;
  modelId?: string;
  glass?: boolean;
  obstacle?: boolean;
  decals: unknown[];
  segId?: string;            // 구간 배치로 생성된 경우
  [k: string]: unknown;
}

export interface ModelDef { name: string; ext: string; data: string; url: string; w: number; d: number; h: number }

export interface UnderlayLayer { name: string; color: string; segs: number[] }
export interface UnderlayData { layers: UnderlayLayer[] }

export interface ImageUnderlay { data: string; w: number; d: number; x: number; z: number }

export type Side = 'back' | 'front' | 'center';
export type Remainder = 'none' | 'stretch' | 'fill';

export interface Segment {
  id: string;
  type: 'line' | 'arc';
  pts: Pt[];                 // line: 꺾은선 점들, arc: [시작, 중간, 끝]
  libId: string;             // 라이브러리 아이템 id
  align: 'start' | 'center';
  side: Side;
  remainder: Remainder;
  gap: number;
}

// 출입구/개구부: 벽(solids 인덱스) 위에 뚫린 구멍
export interface Opening {
  id: string;
  wall: number;      // 벽 인덱스
  t: number;         // 벽 시작점에서 개구부 중심까지 거리(cm)
  w: number;         // 폭
  h: number;         // 높이
  kind: 'open' | 'glass' | 'swing';
}

export interface Project {
  version: number;
  floor: Floor;
  items: Item[];
  images: Record<string, ImageUnderlay>;
  models: Record<string, ModelDef>;
  underlays: Record<string, UnderlayData>;
  segments?: Segment[];
  openings?: Opening[];
}

// 라이브러리 아이템 정의
export interface LibItem {
  id: string;
  name: string;
  cat: string;
  kind: 'box' | 'cyl' | 'model';
  w: number; d: number; h: number;
  color: string;
  y0?: number;
  glass?: boolean;
  obstacle?: boolean;
  modelId?: string;
}
