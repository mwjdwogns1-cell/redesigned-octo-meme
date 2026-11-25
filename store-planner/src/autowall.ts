// DXF 레이어 선 → 벽체 자동 변환
// 벽은 보통 양쪽 면이 평행한 두 줄로 그려지므로, 평행·근접·겹치는 선 쌍을 찾아 중심선 벽으로 합친다.

export interface AutoWallOpts {
  minT: number;        // 최소 두께(cm)
  maxT: number;        // 최대 두께(cm)
  minLen: number;      // 이보다 짧은 선은 무시(cm)
  singles: boolean;    // 짝 없는 선도 벽으로
  singleT: number;     // 짝 없는 선의 두께
}

export interface AutoWallResult { solids: number[]; paired: number; singles: number }

export function autoWalls(segs: number[], o: AutoWallOpts): AutoWallResult {
  type L = { x1: number; z1: number; x2: number; z2: number; len: number; ux: number; uz: number; used: boolean };
  const lines: L[] = [];
  for (let i = 0; i + 3 < segs.length; i += 4) {
    const x1 = segs[i], z1 = segs[i + 1], x2 = segs[i + 2], z2 = segs[i + 3];
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < o.minLen) continue;
    lines.push({ x1, z1, x2, z2, len, ux: (x2 - x1) / len, uz: (z2 - z1) / len, used: false });
  }
  // 후보 쌍 수집
  type C = { a: number; b: number; d: number };
  const cands: C[] = [];
  const cosTol = Math.cos((3 * Math.PI) / 180);
  for (let i = 0; i < lines.length; i++) {
    const A = lines[i];
    for (let j = i + 1; j < lines.length; j++) {
      const B = lines[j];
      const dot = A.ux * B.ux + A.uz * B.uz;
      if (Math.abs(dot) < cosTol) continue;
      // B 양 끝점의 A 직선까지 수직거리
      const nx = -A.uz, nz = A.ux;
      const d1 = (B.x1 - A.x1) * nx + (B.z1 - A.z1) * nz;
      const d2 = (B.x2 - A.x1) * nx + (B.z2 - A.z1) * nz;
      if (Math.sign(d1) !== Math.sign(d2) && Math.abs(d1) > 0.5 && Math.abs(d2) > 0.5) continue;
      const d = (Math.abs(d1) + Math.abs(d2)) / 2;
      if (d < o.minT || d > o.maxT || Math.abs(d1 - d2) > Math.max(2, d * 0.3)) continue;
      // A 방향으로 투영해 겹침 확인
      const p1 = (B.x1 - A.x1) * A.ux + (B.z1 - A.z1) * A.uz;
      const p2 = (B.x2 - A.x1) * A.ux + (B.z2 - A.z1) * A.uz;
      const lo = Math.max(0, Math.min(p1, p2)), hi = Math.min(A.len, Math.max(p1, p2));
      if (hi - lo < Math.min(A.len, B.len) * 0.5) continue;
      cands.push({ a: i, b: j, d });
    }
  }
  cands.sort((p, q) => p.d - q.d);
  const solids: number[] = [];
  let paired = 0;
  for (const c of cands) {
    const A = lines[c.a], B = lines[c.b];
    if (A.used || B.used) continue;
    A.used = B.used = true;
    const nx = -A.uz, nz = A.ux;
    const d1 = (B.x1 - A.x1) * nx + (B.z1 - A.z1) * nz;
    const d2 = (B.x2 - A.x1) * nx + (B.z2 - A.z1) * nz;
    const off = (d1 + d2) / 4; // 중심선 = A에서 두께 절반만큼
    const p1 = (B.x1 - A.x1) * A.ux + (B.z1 - A.z1) * A.uz;
    const p2 = (B.x2 - A.x1) * A.ux + (B.z2 - A.z1) * A.uz;
    // 두 선의 합집합 범위를 벽 길이로 (모서리 빈틈 최소화)
    const lo = Math.min(0, p1, p2), hi = Math.max(A.len, p1, p2);
    const r = (v: number) => Math.round(v * 10) / 10;
    solids.push(
      r(A.x1 + A.ux * lo + nx * off), r(A.z1 + A.uz * lo + nz * off),
      r(A.x1 + A.ux * hi + nx * off), r(A.z1 + A.uz * hi + nz * off),
      r(c.d),
    );
    paired++;
  }
  let singles = 0;
  if (o.singles) for (const A of lines) {
    if (A.used) continue;
    solids.push(A.x1, A.z1, A.x2, A.z2, o.singleT);
    singles++;
  }
  return { solids, paired, singles };
}
