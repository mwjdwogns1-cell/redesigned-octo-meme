import type { Item, LibItem, Pt, Segment } from './types';

export const uid = (p = 'i') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** 3점으로 원호를 만들고 n등분한 점 목록(n+1개)을 반환. 일직선이면 [a, c]. */
export function arcPoints(a: Pt, m: Pt, c: Pt, n: number): Pt[] {
  const ax = a[0], ay = a[1], bx = m[0], by = m[1], cx = c[0], cy = c[1];
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-6) return [a, c];
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  const t0 = Math.atan2(ay - uy, ax - ux);
  const t1 = Math.atan2(by - uy, bx - ux);
  const t2 = Math.atan2(cy - uy, cx - ux);
  const norm = (t: number) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  // 반시계로 t0→t2 가는 동안 t1을 지나면 반시계, 아니면 시계
  const ccwSpan = norm(t2 - t0);
  const ccwMid = norm(t1 - t0);
  const span = ccwMid <= ccwSpan ? ccwSpan : ccwSpan - 2 * Math.PI;
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + (span * i) / n;
    out.push([ux + r * Math.cos(t), uy + r * Math.sin(t)]);
  }
  out[0] = a; out[n] = c;
  return out;
}

export function segmentPath(s: Segment): Pt[] {
  if (s.type === 'arc' && s.pts.length === 3) return arcPoints(s.pts[0], s.pts[1], s.pts[2], 96);
  return s.pts;
}

export function pathLength(p: Pt[]) {
  let L = 0;
  for (let i = 1; i < p.length; i++) L += dist(p[i - 1], p[i]);
  return L;
}

/** 경로 위 거리 s 지점의 좌표 */
export function pointAt(p: Pt[], s: number): Pt {
  if (s <= 0) return p[0];
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const l = dist(p[i - 1], p[i]);
    if (acc + l >= s) {
      const t = l === 0 ? 0 : (s - acc) / l;
      return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t];
    }
    acc += l;
  }
  return p[p.length - 1];
}

export interface ArrayResult { items: Item[]; length: number; count: number; rest: number }

/**
 * 구간을 따라 라이브러리 아이템을 배열.
 * 꺾은선은 각 변을 독립 구간으로, 곡선은 전체 호를 하나로 보고 모듈별 현(chord) 위에 놓는다.
 */
export function expandSegment(seg: Segment, lib: LibItem): ArrayResult {
  const runs: Pt[][] = seg.type === 'arc'
    ? [segmentPath(seg)]
    : seg.pts.slice(1).map((p, i) => [seg.pts[i], p] as Pt[]);
  const items: Item[] = [];
  let total = 0, rest = 0;
  const W = Math.max(1, lib.w), gap = Math.max(0, seg.gap || 0);
  for (const path of runs) {
    const L = pathLength(path);
    total += L;
    let n = Math.floor((L + gap) / (W + gap));
    let w = W;
    let r = L - n * W - Math.max(0, n - 1) * gap;
    if (seg.remainder === 'stretch' && n > 0 && r > 0.5) {
      w = (L - (n - 1) * gap) / n; r = 0;
    }
    if (n === 0 && seg.remainder !== 'none') { n = 1; w = L; r = 0; }
    const off = seg.align === 'center' ? r / 2 : 0;
    const place = (s0: number, ww: number, idx: number) => {
      const a = pointAt(path, s0), b = pointAt(path, s0 + ww);
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz) || 1;
      let theta = Math.atan2(-dz, dx);
      // 앞면(+Z 로컬) 방향: (sinθ, cosθ)
      let fx = Math.sin(theta), fz = Math.cos(theta);
      if (seg.side === 'front') { theta += Math.PI; fx = -fx; fz = -fz; }
      const shift = seg.side === 'center' ? 0 : lib.d / 2;
      // back: 뒷면이 선 위 → 앞쪽으로 d/2 이동. front: 뒤집은 뒤 같은 규칙
      const cx = (a[0] + b[0]) / 2 + fx * shift;
      const cz = (a[1] + b[1]) / 2 + fz * shift;
      items.push({
        id: `${seg.id}_${items.length}`,
        type: lib.kind === 'model' ? `model:${lib.modelId}` : lib.id,
        name: lib.name,
        kind: lib.kind,
        w: Math.round(len * 10) / 10, d: lib.d, h: lib.h,
        color: lib.color,
        x: Math.round(cx * 10) / 10, z: Math.round(cz * 10) / 10,
        rot: Math.round((theta * 180) / Math.PI * 100) / 100,
        y0: lib.y0, glass: lib.glass, modelId: lib.modelId,
        decals: [], segId: seg.id, segIdx: idx,
      });
    };
    for (let i = 0; i < n; i++) place(off + i * (w + gap), w, i);
    if (seg.remainder === 'fill' && r > 1) place(off + n * (w + gap), r - (n > 0 ? gap : 0), n);
    else rest += Math.max(0, r);
  }
  return { items, length: total, count: items.length, rest };
}
