import type { Item, LibItem, Project, Segment } from './types';
import { arcPoints, expandSegment, uid } from './geom';
import { DEFAULT_LIBRARY } from './library';

export function newProject(w = 2000, d = 1200): Project {
  return {
    version: 1,
    floor: {
      w, d, color: '#3b3b3b', shape: 'rect', decals: [],
      mat: { preset: 'marble', tile: 80, tint: '#ffffff' },
      underlay: { ref: null, visible: true, opacity: 1, hidden: [] },
      plan: { id: uid('plan'), name: '직접 그림', h: 270, walls: [], solids: [], glass: [], doors: [], lines: [], rev: 0, wallStyle: {} },
      zones: [],
    },
    items: [], images: {}, models: {}, underlays: {}, segments: [],
  };
}

/** 외부 저장본(동일 포맷)을 읽을 때 빠진 필드를 채운다 */
export function normalizeProject(raw: unknown): Project {
  const base = newProject();
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<Project>;
  const f = { ...base.floor, ...(p.floor || {}) };
  f.mat = { ...base.floor.mat, ...(f.mat || {}) };
  f.underlay = { ...base.floor.underlay, ...(f.underlay || {}) };
  f.plan = { ...base.floor.plan, ...(f.plan || {}) };
  f.plan.solids = Array.isArray(f.plan.solids) ? f.plan.solids : [];
  f.plan.wallStyle = f.plan.wallStyle || {};
  f.zones = Array.isArray(f.zones) ? f.zones : [];
  return {
    version: p.version ?? 1,
    floor: f,
    items: Array.isArray(p.items) ? p.items.map((i) => ({ ...i, decals: i.decals ?? [], rot: i.rot ?? 0 })) as Item[] : [],
    images: p.images || {},
    models: p.models || {},
    underlays: p.underlays || {},
    segments: Array.isArray(p.segments) ? p.segments : [],
  };
}

/** 무거운 데이터(도면·이미지·모델)는 참조 유지, 나머지만 깊은 복사 */
export function cloneProject(p: Project): Project {
  const { underlays, images, models, ...rest } = p;
  const c = structuredClone(rest) as Omit<Project, 'underlays' | 'images' | 'models'>;
  return { ...c, underlays: { ...underlays }, images: { ...images }, models: { ...models } };
}

export function libFromModels(p: Project): LibItem[] {
  return Object.entries(p.models).map(([id, m]) => ({
    id: 'model:' + id, name: m.name, cat: '3D 모델', kind: 'model', w: m.w, d: m.d, h: m.h, color: '#cccccc', modelId: id,
  }));
}

export function itemFromLib(lib: LibItem, x: number, z: number, rot = 0): Item {
  return {
    id: uid('i'), type: lib.kind === 'model' ? `model:${lib.modelId}` : lib.id, name: lib.name, kind: lib.kind,
    w: lib.w, d: lib.d, h: lib.h, color: lib.color, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, rot,
    y0: lib.y0, glass: lib.glass, obstacle: lib.obstacle, modelId: lib.modelId, decals: [],
  };
}

export function regenSegment(p: Project, seg: Segment, lib: LibItem | undefined) {
  p.items = p.items.filter((i) => i.segId !== seg.id);
  if (!lib) return { count: 0, rest: 0, length: 0 };
  const r = expandSegment(seg, lib);
  p.items.push(...r.items);
  return r;
}

export function removeWall(p: Project, idx: number) {
  const pl = p.floor.plan;
  pl.solids.splice(idx * 5, 5);
  const st: typeof pl.wallStyle = {};
  for (const [k, v] of Object.entries(pl.wallStyle)) {
    const n = Number(k);
    if (n < idx) st[k] = v; else if (n > idx) st[String(n - 1)] = v;
  }
  pl.wallStyle = st;
  pl.rev++;
}

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function readAs(file: File, kind: 'text' | 'dataURL' | 'buffer'): Promise<string | ArrayBuffer> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string | ArrayBuffer);
    r.onerror = () => rej(r.error);
    if (kind === 'text') r.readAsText(file);
    else if (kind === 'dataURL') r.readAsDataURL(file);
    else r.readAsArrayBuffer(file);
  });
}

export interface TallyRow { name: string; size: string; count: number }

export function tally(p: Project) {
  const m = new Map<string, TallyRow>();
  for (const i of p.items) {
    const size = `${Math.round(i.w)}×${Math.round(i.d)}×${Math.round(i.h)}`;
    const k = i.name + '|' + size;
    const r = m.get(k) || { name: i.name, size, count: 0 };
    r.count++;
    m.set(k, r);
  }
  let wallLen = 0, glassLen = 0;
  const s = p.floor.plan.solids;
  for (let i = 0, idx = 0; i + 4 < s.length + 1; i += 5, idx++) {
    const L = Math.hypot(s[i + 2] - s[i], s[i + 3] - s[i + 1]);
    if (p.floor.plan.wallStyle[String(idx)]?.kind === 'glass') glassLen += L; else wallLen += L;
  }
  return { rows: [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko')), wallLen, glassLen };
}

export function tallyCSV(p: Project) {
  const t = tally(p);
  const lines = ['구분,규격(W×D×H cm),수량'];
  for (const r of t.rows) lines.push(`"${r.name}",${r.size},${r.count}`);
  lines.push(`"벽체 총길이(m)",,${(t.wallLen / 100).toFixed(2)}`);
  lines.push(`"유리 총길이(m)",,${(t.glassLen / 100).toFixed(2)}`);
  return '﻿' + lines.join('\n');
}

/** 기능 확인용 샘플 매장 (가상의 형태) */
export function sampleProject(): Project {
  const p = newProject(2400, 1300);
  const pl = p.floor.plan;
  const W = (x1: number, z1: number, x2: number, z2: number, t = 15) => pl.solids.push(x1, z1, x2, z2, t);
  W(-1200, -650, 1200, -650);       // 뒷벽
  W(-1200, -650, -1200, 650);       // 왼쪽 벽
  W(1200, -650, 1200, -50);         // 오른쪽 벽 (일부)
  // 우측 하단 곡선 쇼윈도: (1200,-50) → (850,520) → (200,650)
  const idx0 = pl.solids.length / 5;
  const arc = [[1200, -50], [985, 405], [200, 650]] as [number, number][];
  p.segments = [];
  const pts = arcPoints(arc[0], arc[1], arc[2], 12);
  for (let i = 1; i < pts.length; i++) {
    W(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 2);
    pl.wallStyle[String(idx0 + i - 1)] = { kind: 'glass', h: 300 };
  }
  W(200, 650, -1200, 650);          // 앞벽
  p.segments.push(
    { id: 'sg1', type: 'line', pts: [[-1180, -635], [1180, -635]], libId: 'wall-panel-240', align: 'center', side: 'back', remainder: 'fill', gap: 0 },
    { id: 'sg2', type: 'line', pts: [[-1185, 620], [-1185, -620]], libId: 'wall-shelf-120', align: 'center', side: 'back', remainder: 'none', gap: 0 },
    { id: 'sg3', type: 'line', pts: [[-700, -625], [500, -625]], libId: 'display-65', align: 'center', side: 'back', remainder: 'none', gap: 25 },
  );
  for (const sg of p.segments) regenSegment(p, sg, DEFAULT_LIBRARY.find((l) => l.id === sg.libId));
  p.items.push(
    itemFromLib(DEFAULT_LIBRARY.find((l) => l.id === 'table-exp-180')!, -200, 0),
    itemFromLib(DEFAULT_LIBRARY.find((l) => l.id === 'table-exp-180')!, 200, 0),
    itemFromLib(DEFAULT_LIBRARY.find((l) => l.id === 'sofa-240')!, -500, -300),
    itemFromLib(DEFAULT_LIBRARY.find((l) => l.id === 'column-sq')!, 600, -200),
  );
  return p;
}
