import DxfParser from 'dxf-parser';
import type { UnderlayData, UnderlayLayer } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type M = [number, number, number, number, number, number]; // 2D 아핀 [a,b,c,d,e,f]: x'=a*x+c*y+e, y'=b*x+d*y+f
const I: M = [1, 0, 0, 1, 0, 0];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const ap = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// $INSUNITS → cm 배율
const UNIT_TO_CM: Record<number, number> = { 1: 2.54, 2: 30.48, 4: 0.1, 5: 1, 6: 100 };

export async function decodeText(buf: ArrayBuffer): Promise<string> {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('euc-kr').decode(buf); }
}

const ACI = ['#000000', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#cccccc', '#808080', '#c0c0c0'];

export interface DxfResult { data: UnderlayData; unitNote: string; segCount: number; width: number; depth: number }

export function parseDxf(text: string, forceUnitCm?: number): DxfResult {
  const parser = new DxfParser();
  const dxf: any = parser.parseSync(text);
  if (!dxf) throw new Error('DXF를 읽지 못했습니다');
  const ins = dxf.header?.$INSUNITS as number | undefined;
  let scale = forceUnitCm ?? (ins && UNIT_TO_CM[ins]) ?? 0.1;
  const unitNote = forceUnitCm ? '수동 지정' : ins && UNIT_TO_CM[ins] ? `INSUNITS=${ins}` : '단위 정보 없음 → mm로 가정';

  const layers = new Map<string, number[]>();
  const push = (layer: string, x1: number, y1: number, x2: number, y2: number) => {
    let a = layers.get(layer);
    if (!a) { a = []; layers.set(layer, a); }
    a.push(x1, y1, x2, y2);
  };
  const poly = (layer: string, m: M, pts: [number, number][], closed = false) => {
    for (let i = 1; i < pts.length; i++) {
      const p = ap(m, pts[i - 1][0], pts[i - 1][1]), q = ap(m, pts[i][0], pts[i][1]);
      push(layer, p[0], p[1], q[0], q[1]);
    }
    if (closed && pts.length > 2) {
      const p = ap(m, pts[pts.length - 1][0], pts[pts.length - 1][1]), q = ap(m, pts[0][0], pts[0][1]);
      push(layer, p[0], p[1], q[0], q[1]);
    }
  };
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number): [number, number][] => {
    let span = a1 - a0;
    while (span <= 0) span += Math.PI * 2;
    const n = Math.max(6, Math.ceil(span / (Math.PI / 24)));
    const out: [number, number][] = [];
    for (let i = 0; i <= n; i++) { const t = a0 + (span * i) / n; out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
    return out;
  };
  const bulgePts = (vs: any[], closed: boolean): [number, number][] => {
    const out: [number, number][] = [];
    const n = vs.length;
    for (let i = 0; i < n; i++) {
      const v = vs[i];
      out.push([v.x, v.y]);
      const nx = vs[(i + 1) % n];
      if (!closed && i === n - 1) break;
      if (v.bulge) {
        const th = 4 * Math.atan(v.bulge);
        const dx = nx.x - v.x, dy = nx.y - v.y, c = Math.hypot(dx, dy);
        if (c > 0) {
          const r = c / (2 * Math.sin(th / 2));
          const mx = (v.x + nx.x) / 2, my = (v.y + nx.y) / 2;
          const h = r * Math.cos(th / 2);
          const cx = mx - (dy / c) * h, cy = my + (dx / c) * h;
          const a0 = Math.atan2(v.y - cy, v.x - cx);
          const steps = Math.max(4, Math.ceil(Math.abs(th) / (Math.PI / 24)));
          for (let k = 1; k < steps; k++) {
            const t = a0 + (th * k) / steps;
            out.push([cx + Math.abs(r) * Math.cos(t), cy + Math.abs(r) * Math.sin(t)]);
          }
        }
      }
    }
    if (closed && out.length) out.push(out[0]);
    return out;
  };

  const walk = (ents: any[], m: M, parentLayer: string | null, depth: number) => {
    if (depth > 6) return;
    for (const e of ents || []) {
      let layer: string = e.layer ?? '0';
      if (layer === '0' && parentLayer) layer = parentLayer;
      switch (e.type) {
        case 'LINE':
          if (e.vertices?.length >= 2) poly(layer, m, [[e.vertices[0].x, e.vertices[0].y], [e.vertices[1].x, e.vertices[1].y]]);
          break;
        case 'LWPOLYLINE':
        case 'POLYLINE': {
          const vs = (e.vertices || []).filter((v: any) => v && isFinite(v.x));
          if (vs.length >= 2) poly(layer, m, bulgePts(vs, !!e.shape), false);
          break;
        }
        case 'ARC': poly(layer, m, arc(e.center.x, e.center.y, e.radius, e.startAngle, e.endAngle)); break;
        case 'CIRCLE': poly(layer, m, arc(e.center.x, e.center.y, e.radius, 0, Math.PI * 2)); break;
        case 'ELLIPSE': {
          const mx = e.majorAxisEndPoint.x, my = e.majorAxisEndPoint.y, R = Math.hypot(mx, my), rr = R * e.axisRatio;
          const rot = Math.atan2(my, mx);
          let a0 = e.startAngle ?? 0, a1 = e.endAngle ?? Math.PI * 2;
          if (a1 <= a0) a1 += Math.PI * 2;
          const pts: [number, number][] = [];
          for (let i = 0; i <= 48; i++) {
            const t = a0 + ((a1 - a0) * i) / 48, x = R * Math.cos(t), y = rr * Math.sin(t);
            pts.push([e.center.x + x * Math.cos(rot) - y * Math.sin(rot), e.center.y + x * Math.sin(rot) + y * Math.cos(rot)]);
          }
          poly(layer, m, pts);
          break;
        }
        case 'SPLINE': {
          const src = (e.fitPoints?.length ? e.fitPoints : e.controlPoints) || [];
          poly(layer, m, src.map((p: any) => [p.x, p.y] as [number, number]));
          break;
        }
        case 'SOLID':
        case '3DFACE': {
          const pts = (e.points || e.vertices || []).map((p: any) => [p.x, p.y] as [number, number]);
          if (pts.length >= 3) poly(layer, m, pts, true);
          break;
        }
        case 'INSERT': {
          const b = dxf.blocks?.[e.name];
          if (!b) break;
          const sx = e.xScale ?? 1, sy = e.yScale ?? 1, r = ((e.rotation ?? 0) * Math.PI) / 180;
          const bp = b.position || { x: 0, y: 0 };
          const cols = e.columnCount || 1, rows = e.rowCount || 1;
          for (let ci = 0; ci < cols; ci++) for (let ri = 0; ri < rows; ri++) {
            const ox = ci * (e.columnSpacing || 0), oy = ri * (e.rowSpacing || 0);
            const t: M = [Math.cos(r) * sx, Math.sin(r) * sx, -Math.sin(r) * sy, Math.cos(r) * sy,
              e.position.x + Math.cos(r) * ox - Math.sin(r) * oy, e.position.y + Math.sin(r) * ox + Math.cos(r) * oy];
            const local = mul(t, [1, 0, 0, 1, -bp.x, -bp.y]);
            walk(b.entities, mul(m, local), layer, depth + 1);
          }
          break;
        }
        default: break;
      }
    }
  };
  walk(dxf.entities, I, null, 0);

  // 범위 계산 → 중심을 원점으로, Y 반전(도면 위쪽 = 화면 위쪽 = -Z), cm 변환
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const a of layers.values()) for (let i = 0; i < a.length; i += 2) {
    const x = a[i], y = a[i + 1];
    if (!isFinite(x) || !isFinite(y)) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (!isFinite(minX)) throw new Error('그릴 수 있는 선이 없습니다 (LINE/POLYLINE/ARC/INSERT)');
  // 단위 정보가 없는데 결과가 비정상적으로 크거나 작으면 보정
  const span = Math.max(maxX - minX, maxY - minY) * scale;
  let note = unitNote;
  if (!forceUnitCm && !(ins && UNIT_TO_CM[ins])) {
    if (span > 50000) { scale = scale / 10; note += ' (너무 커서 1/10 보정)'; }
    else if (span < 300) { scale = scale * 10; note += ' (너무 작아 ×10 보정)'; }
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const colorOf = (name: string) => {
    const l = dxf.tables?.layer?.layers?.[name];
    if (l && typeof l.color === 'number' && l.color !== 0 && l.color !== 0xffffff) return '#' + l.color.toString(16).padStart(6, '0');
    if (l && typeof l.colorIndex === 'number' && ACI[l.colorIndex]) return ACI[l.colorIndex];
    return '#8a8f98';
  };
  const out: UnderlayLayer[] = [];
  let segCount = 0;
  for (const [name, a] of layers) {
    const segs: number[] = new Array(a.length);
    for (let i = 0; i < a.length; i += 2) {
      segs[i] = Math.round((a[i] - cx) * scale * 10) / 10;
      segs[i + 1] = Math.round(-(a[i + 1] - cy) * scale * 10) / 10;
    }
    segCount += segs.length / 4;
    out.push({ name, color: colorOf(name), segs });
  }
  return { data: { layers: out }, unitNote: note, segCount, width: (maxX - minX) * scale, depth: (maxY - minY) * scale };
}
