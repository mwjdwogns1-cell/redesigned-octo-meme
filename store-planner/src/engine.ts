import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { Item, Project, Pt } from './types';
import { arcPoints, dist, segmentPath } from './geom';

export type Tool = 'select' | 'wall' | 'glass' | 'array' | 'place' | 'calibrate';
export type Shape = 'line' | 'arc';
export type Selection = { type: 'item'; id: string } | { type: 'wall'; idx: number } | null;
export interface Layers { walls: boolean; glass: boolean; items: boolean; underlay: boolean; segs: boolean }

export interface EngineCallbacks {
  onSelect(sel: Selection): void;
  onWall(a: Pt, b: Pt, glass: boolean): void;
  onWallPath(pts: Pt[], glass: boolean): void;
  onSegment(type: Shape, pts: Pt[]): void;
  onPlace(p: Pt): void;
  onMoveItem(id: string, x: number, z: number): void;
  onCalibrate(a: Pt, b: Pt): void;
  onStatus(text: string): void;
}

const loader = new GLTFLoader();
// 모델 캐시: 원점=바닥 중앙, 크기 1×1×1로 정규화된 오브젝트
const modelCache = new Map<string, Promise<{ obj: THREE.Object3D; size: THREE.Vector3 } | null>>();

export function loadModel(key: string, src: string) {
  let p = modelCache.get(key);
  if (!p) {
    p = loader.loadAsync(src).then((g) => normalize(g.scene)).catch(() => null);
    modelCache.set(key, p);
  }
  return p;
}

export function normalize(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const inner = new THREE.Group();
  scene.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
  inner.add(scene);
  const s = new THREE.Vector3(1 / (size.x || 1), 1 / (size.y || 1), 1 / (size.z || 1));
  inner.scale.copy(s);
  const outer = new THREE.Group();
  outer.add(inner);
  outer.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return { obj: outer, size: size.multiplyScalar(100) }; // glTF m → cm
}

function tileTexture(tint: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = tint; g.fillRect(0, 0, 256, 256);
  // 은은한 대리석 결
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(120,120,120,${0.03 + Math.random() * 0.05})`;
    g.lineWidth = Math.random() * 2;
    g.beginPath();
    let x = Math.random() * 256, y = Math.random() * 256;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 80; y += (Math.random() - 0.5) * 80; g.lineTo(x, y); }
    g.stroke();
  }
  g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  persp: THREE.PerspectiveCamera;
  ortho: THREE.OrthographicCamera;
  ctl3: OrbitControls;
  ctl2: OrbitControls;
  view: '2d' | '3d' = '3d';
  tool: Tool = 'select';
  shape: Shape = 'line';
  arcN = 12;
  snapGrid = true;
  layers: Layers = { walls: true, glass: true, items: true, underlay: true, segs: true };

  private el: HTMLElement;
  private cb: EngineCallbacks;
  private project: Project | null = null;
  private gFloor = new THREE.Group();
  private gUnder = new THREE.Group();
  private gWalls = new THREE.Group();
  private gItems = new THREE.Group();
  private gSegs = new THREE.Group();
  private gTool = new THREE.Group();
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private pts: Pt[] = [];
  private hover: Pt | null = null;
  private snapPts: Float32Array = new Float32Array(0);
  private sel: Selection = null;
  private down: { x: number; y: number; button: number } | null = null;
  private drag: { id: string; grp: THREE.Object3D; ox: number; oz: number; moved: boolean } | null = null;
  private shift = false;
  private uSig = '';
  private uData: unknown = undefined;
  private raf = 0;
  private ro: ResizeObserver;
  private marker: THREE.Mesh;
  private rubber: THREE.Line;
  private sun = new THREE.DirectionalLight(0xffffff, 1.6);

  constructor(el: HTMLElement, cb: EngineCallbacks) {
    this.el = el; this.cb = cb;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#e9e9ec');

    this.persp = new THREE.PerspectiveCamera(40, 1, 10, 200000);
    this.persp.position.set(1800, 2200, 2600);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -100000, 100000);
    this.ortho.position.set(0, 5000, 0.01);
    this.ortho.zoom = 0.3;

    this.ctl3 = new OrbitControls(this.persp, this.renderer.domElement);
    this.ctl3.enableDamping = true;
    this.ctl3.maxPolarAngle = Math.PI / 2 - 0.02;
    this.ctl2 = new OrbitControls(this.ortho, this.renderer.domElement);
    this.ctl2.enableRotate = false;
    this.ctl2.screenSpacePanning = true;
    this.ctl2.mouseButtons = { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    this.ctl2.enabled = false;

    const hemi = new THREE.HemisphereLight(0xffffff, 0xb8b4ac, 1.6);
    this.scene.add(hemi);
    const sun = this.sun;
    sun.position.set(-1500, 3000, 1200);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -2500; sc.right = 2500; sc.top = 2500; sc.bottom = -2500; sc.near = 100; sc.far = 8000;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    this.scene.add(this.gFloor, this.gUnder, this.gWalls, this.gItems, this.gSegs, this.gTool);
    this.marker = new THREE.Mesh(new THREE.RingGeometry(6, 10, 24), new THREE.MeshBasicMaterial({ color: 0xff3b30, depthTest: false }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.renderOrder = 999;
    this.marker.visible = false;
    this.rubber = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff3b30, depthTest: false }));
    this.rubber.renderOrder = 998;
    this.gTool.add(this.marker, this.rubber);

    const d = this.renderer.domElement;
    d.addEventListener('pointerdown', this.onDown, { capture: true });
    d.addEventListener('pointermove', this.onMove);
    d.addEventListener('pointerup', this.onUp);
    d.addEventListener('dblclick', this.onDbl);
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      (this.view === '3d' ? this.ctl3 : this.ctl2).update();
      this.renderer.render(this.scene, this.cam);
    };
    loop();
  }

  get cam(): THREE.Camera { return this.view === '3d' ? this.persp : this.ortho; }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.persp.aspect = w / h; this.persp.updateProjectionMatrix();
    this.ortho.left = -w / 2; this.ortho.right = w / 2; this.ortho.top = h / 2; this.ortho.bottom = -h / 2;
    this.ortho.updateProjectionMatrix();
  }

  setView(v: '2d' | '3d') {
    this.view = v;
    this.sun.castShadow = v === '3d';
    this.ctl3.enabled = v === '3d';
    this.ctl2.enabled = v === '2d';
    this.updateControlButtons();
  }

  setTool(t: Tool, shape?: Shape) {
    this.tool = t;
    if (shape) this.shape = shape;
    this.pts = [];
    this.updateRubber();
    this.updateControlButtons();
    const hints: Record<Tool, string> = {
      select: '클릭: 선택 · 드래그: 이동 · Q/E 회전 · Del 삭제',
      wall: this.shape === 'arc' ? '곡선 벽: 시작 → 중간(가장 볼록) → 끝 클릭' : '벽: 점을 연속 클릭 · 같은 점 다시 클릭/더블클릭/Esc로 끝내기 · Shift 직교',
      glass: this.shape === 'arc' ? '곡선 유리: 시작 → 중간 → 끝 클릭' : '유리: 점을 연속 클릭 · 더블클릭/Esc로 끝내기 · Shift 직교',
      array: this.shape === 'arc' ? '구간 배치(곡선): 시작 → 중간 → 끝 클릭' : '구간 배치: 벽 선을 따라 클릭 · 더블클릭/Enter로 확정',
      place: '클릭한 위치에 선택한 아이템 배치',
      calibrate: '축척: 실제 길이를 아는 두 점을 클릭',
    };
    this.cb.onStatus(hints[t]);
  }

  private updateControlButtons() {
    // 3D에서 그리기 도구 사용 중엔 왼쪽=그리기, 오른쪽=회전, 가운데=이동
    if (this.tool === 'select') this.ctl3.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    else this.ctl3.mouseButtons = { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
  }

  setSelection(sel: Selection) { this.sel = sel; this.refreshHighlight(); }

  setLayers(l: Layers) {
    this.layers = l;
    this.gUnder.visible = l.underlay;
    this.gItems.visible = l.items;
    this.gSegs.visible = l.segs && this.view === '2d';
    this.gWalls.children.forEach((m) => { m.visible = m.userData.glass ? l.glass : l.walls; });
    this.buildSnapPoints();
  }

  preset(name: 'iso' | 'front' | 'side' | 'top') {
    const p = this.project; if (!p) return;
    const R = Math.max(p.floor.w, p.floor.d) * 1.15;
    const t = this.ctl3.target.set(0, 0, 0);
    const pos = { iso: [R * 0.6, R * 0.75, R * 0.85], front: [0, 160, R * 1.1], side: [R * 1.1, 160, 0], top: [0, R * 1.4, 1] }[name];
    this.persp.position.set(pos[0], pos[1], pos[2]);
    this.persp.lookAt(t);
  }

  fit() {
    const p = this.project; if (!p) return;
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.ortho.zoom = Math.min(w / (p.floor.w * 1.1), h / (p.floor.d * 1.1));
    this.ortho.position.set(0, 5000, 0.01);
    this.ctl2.target.set(0, 0, 0);
    this.ortho.updateProjectionMatrix();
    this.preset('iso');
  }

  // ───────────────────────── 장면 구성 ─────────────────────────
  setProject(p: Project) {
    const first = !this.project;
    this.project = p;
    this.buildFloor(p);
    this.buildUnderlay(p);
    this.buildWalls(p);
    this.buildItems(p);
    this.buildSegs(p);
    this.setLayers(this.layers);
    this.refreshHighlight();
    if (first) this.fit();
  }

  private clear(g: THREE.Group) {
    for (const c of [...g.children]) {
      g.remove(c);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && !o.userData.shared) m.geometry.dispose();
      });
    }
  }

  private buildFloor(p: Project) {
    this.clear(this.gFloor);
    const f = p.floor;
    const tile = f.mat?.tile || 80;
    const tex = tileTexture(f.mat?.preset === 'marble' ? '#dcdad6' : (f.mat?.tint || f.color || '#d8d8d8'));
    const mk = (geo: THREE.BufferGeometry, w: number, d: number) => {
      const t = tex.clone(); t.needsUpdate = true; t.repeat.set(w / tile, d / tile);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
      m.receiveShadow = true;
      return m;
    };
    const floor = mk(new THREE.PlaneGeometry(f.w, f.d), f.w, f.d);
    floor.rotation.x = -Math.PI / 2;
    floor.name = 'FLOOR';
    floor.userData.export = true;
    this.gFloor.add(floor);
    // 기초 판 (두께감)
    const base = new THREE.Mesh(new THREE.BoxGeometry(f.w, 10, f.d), new THREE.MeshStandardMaterial({ color: '#cfcdc8' }));
    base.position.y = -5.05;
    this.gFloor.add(base);
    // 바닥 구역
    for (const z of f.zones || []) {
      if (!z.pts || z.pts.length < 3) continue;
      const s = new THREE.Shape(z.pts.map(([x, y]) => new THREE.Vector2(x, -y)));
      const g = new THREE.ShapeGeometry(s);
      const m = mk(g, 1, 1);
      (m.material as THREE.MeshStandardMaterial).map!.repeat.set(1 / tile, 1 / tile);
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.3;
      m.name = 'FLOOR_' + z.id;
      m.userData.export = true;
      this.gFloor.add(m);
    }
  }

  private buildUnderlay(p: Project) {
    const u = p.floor.underlay;
    const ref = u?.ref;
    const data = ref ? p.underlays[ref] || p.images[ref] || null : null;
    const sig = JSON.stringify([ref, u?.opacity, u?.visible, u?.hidden]);
    if (sig === this.uSig && data === this.uData) return;
    this.uSig = sig; this.uData = data;
    this.clear(this.gUnder);
    if (!ref || u.visible === false) { this.buildSnapPoints(); return; }
    const op = Math.max(0.05, Math.min(1, u.opacity ?? 1));
    const dxf = p.underlays[ref];
    if (dxf) {
      const hidden = new Set(u.hidden || []);
      for (const l of dxf.layers) {
        if (hidden.has(l.name) || !l.segs.length) continue;
        const pos = new Float32Array((l.segs.length / 4) * 6);
        for (let i = 0, j = 0; i < l.segs.length; i += 4, j += 6) {
          pos[j] = l.segs[i]; pos[j + 1] = 0.6; pos[j + 2] = l.segs[i + 1];
          pos[j + 3] = l.segs[i + 2]; pos[j + 4] = 0.6; pos[j + 5] = l.segs[i + 3];
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const c = new THREE.Color(l.color);
        if (c.getHSL({ h: 0, s: 0, l: 0 }).l > 0.85) c.set('#555555');
        const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: op }));
        ls.userData.layer = l.name;
        this.gUnder.add(ls);
      }
    }
    const img = p.images[ref];
    if (img) {
      const t = new THREE.TextureLoader().load(img.data);
      t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(img.w, img.d),
        new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: op, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(img.x, 0.4, img.z);
      this.gUnder.add(m);
    }
  }

  private buildWalls(p: Project) {
    this.clear(this.gWalls);
    const s = p.floor.plan.solids;
    const st = p.floor.plan.wallStyle || {};
    const topMat = new THREE.MeshStandardMaterial({ color: '#8d8d8d', roughness: 0.8 });
    for (let i = 0, idx = 0; i + 4 < s.length + 1; i += 5, idx++) {
      const [x1, z1, x2, z2, t] = [s[i], s[i + 1], s[i + 2], s[i + 3], s[i + 4]];
      const L = Math.hypot(x2 - x1, z2 - z1);
      if (L < 0.1) continue;
      const style = st[String(idx)] || {};
      const glass = style.kind === 'glass';
      const h = style.h ?? p.floor.plan.h ?? 270;
      const y0 = style.y0 ?? 0;
      const geo = new THREE.BoxGeometry(L, h, Math.max(0.5, t));
      let mesh: THREE.Mesh;
      if (glass) {
        mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
          color: style.color || '#9fd0ee', transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, depthWrite: false,
        }));
      } else {
        const side = new THREE.MeshStandardMaterial({ color: style.color || '#efece6', roughness: 0.85 });
        mesh = new THREE.Mesh(geo, [side, side, topMat, side, side, side]);
        mesh.castShadow = true; mesh.receiveShadow = true;
      }
      mesh.position.set((x1 + x2) / 2, y0 + h / 2, (z1 + z2) / 2);
      mesh.rotation.y = Math.atan2(-(z2 - z1), x2 - x1);
      if (glass) {
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x3a9ad9 }));
        e.userData.noExport = true;
        mesh.add(e);
      }
      mesh.name = (glass ? 'GLASS_' : 'WALL_') + String(idx).padStart(3, '0');
      mesh.userData = { sel: { type: 'wall', idx }, glass, export: true };
      this.gWalls.add(mesh);
    }
  }

  private makeItem(it: Item, p: Project): THREE.Object3D {
    const grp = new THREE.Group();
    grp.position.set(it.x, it.y0 || 0, it.z);
    grp.rotation.y = (it.rot * Math.PI) / 180;
    grp.name = 'ITEM_' + (it.name || it.type).replace(/\s+/g, '_') + '_' + it.id;
    grp.userData = { sel: { type: 'item', id: it.id }, export: true, item: it };
    const boxFallback = () => {
      const glass = !!it.glass;
      const geo = it.kind === 'cyl' ? new THREE.CylinderGeometry(it.w / 2, it.w / 2, it.h, 32) : new THREE.BoxGeometry(it.w, it.h, it.d);
      const mat = glass
        ? new THREE.MeshStandardMaterial({ color: it.color, transparent: true, opacity: 0.3, depthWrite: false, roughness: 0.05 })
        : new THREE.MeshStandardMaterial({ color: it.color || '#cccccc', roughness: 0.7 });
      const m = new THREE.Mesh(geo, mat);
      m.position.y = it.h / 2;
      if (it.kind === 'cyl') m.scale.z = it.d / it.w;
      m.castShadow = !glass; m.receiveShadow = true;
      m.userData.sel = grp.userData.sel;
      grp.add(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.35 }));
      e.position.copy(m.position); e.scale.copy(m.scale);
      e.userData.noExport = true;
      grp.add(e);
      return m;
    };
    if (it.kind === 'model' && it.modelId) {
      const md = p.models[it.modelId];
      const src = md?.data || md?.url;
      const ph = boxFallback();
      if (src) {
        loadModel(it.modelId, src).then((r) => {
          if (!r) {
            (ph.material as THREE.MeshStandardMaterial).color.set('#c9ccd1');
            return;
          }
          grp.clear();
          const o = r.obj.clone(true);
          o.scale.set(it.w, it.h, it.d);
          o.traverse((c) => { c.userData.sel = grp.userData.sel; });
          grp.add(o);
          this.refreshHighlight();
        });
      }
    } else boxFallback();
    return grp;
  }

  private buildItems(p: Project) {
    this.clear(this.gItems);
    for (const it of p.items) this.gItems.add(this.makeItem(it, p));
  }

  private buildSegs(p: Project) {
    this.clear(this.gSegs);
    for (const s of p.segments || []) {
      const path = segmentPath(s);
      const g = new THREE.BufferGeometry().setFromPoints(path.map(([x, z]) => new THREE.Vector3(x, 2, z)));
      const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0xff9500, dashSize: 20, gapSize: 12, depthTest: false }));
      l.computeLineDistances();
      l.renderOrder = 997;
      this.gSegs.add(l);
    }
  }

  private highlight: THREE.Object3D | null = null;
  private refreshHighlight() {
    if (this.highlight) { this.scene.remove(this.highlight); this.highlight = null; }
    const sel = this.sel; if (!sel) return;
    let target: THREE.Object3D | undefined;
    if (sel.type === 'item') target = this.gItems.children.find((c) => c.userData.sel?.id === sel.id);
    else target = this.gWalls.children.find((c) => c.userData.sel?.idx === sel.idx);
    if (!target) return;
    const h = new THREE.BoxHelper(target, 0x0a84ff);
    (h.material as THREE.LineBasicMaterial).depthTest = false;
    h.renderOrder = 1000;
    this.highlight = h;
    this.scene.add(h);
  }

  updateItemLive(it: Item) {
    const g = this.gItems.children.find((c) => c.userData.sel?.id === it.id);
    if (g) { g.position.set(it.x, it.y0 || 0, it.z); g.rotation.y = (it.rot * Math.PI) / 180; this.refreshHighlight(); }
  }

  // ───────────────────────── 스냅 ─────────────────────────
  private buildSnapPoints() {
    const p = this.project; if (!p) return;
    const arr: number[] = [];
    const s = p.floor.plan.solids;
    for (let i = 0; i + 4 < s.length + 1; i += 5) arr.push(s[i], s[i + 1], s[i + 2], s[i + 3]);
    for (const seg of p.segments || []) for (const q of seg.pts) arr.push(q[0], q[1]);
    const u = p.floor.underlay;
    if (this.layers.underlay && u?.ref && u.visible !== false && p.underlays[u.ref]) {
      const hidden = new Set(u.hidden || []);
      for (const l of p.underlays[u.ref].layers) if (!hidden.has(l.name)) for (const v of l.segs) arr.push(v);
    }
    // 바닥 모서리
    const hw = p.floor.w / 2, hd = p.floor.d / 2;
    arr.push(-hw, -hd, hw, -hd, hw, hd, -hw, hd);
    this.snapPts = new Float32Array(arr);
  }

  private worldPerPx() {
    if (this.view === '2d') return 1 / this.ortho.zoom;
    const d = this.persp.position.distanceTo(this.ctl3.target);
    return (2 * d * Math.tan((this.persp.fov * Math.PI) / 360)) / (this.el.clientHeight || 1);
  }

  private floorPoint(e: PointerEvent | MouseEvent): Pt | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.cam);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, hit)) return null;
    return [hit.x, hit.z];
  }

  private snap(p: Pt): { p: Pt; snapped: boolean } {
    const last = this.pts[this.pts.length - 1];
    if (this.shift && last) {
      const dx = Math.abs(p[0] - last[0]), dz = Math.abs(p[1] - last[1]);
      p = dx > dz ? [p[0], last[1]] : [last[0], p[1]];
    }
    const th = 12 * this.worldPerPx();
    let best = th * th, bx = 0, bz = 0, found = false;
    const a = this.snapPts;
    for (let i = 0; i < a.length; i += 2) {
      const dx = a[i] - p[0], dz = a[i + 1] - p[1];
      const d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; bx = a[i]; bz = a[i + 1]; found = true; }
    }
    if (found) {
      if (this.shift && last) return { p: Math.abs(p[0] - last[0]) > Math.abs(p[1] - last[1]) ? [bx, last[1]] : [last[0], bz], snapped: true };
      return { p: [bx, bz], snapped: true };
    }
    if (this.snapGrid) return { p: [Math.round(p[0] / 10) * 10, Math.round(p[1] / 10) * 10], snapped: false };
    return { p, snapped: false };
  }

  private updateRubber() {
    const pts = [...this.pts];
    if (this.hover && pts.length && this.tool !== 'select' && this.tool !== 'place') pts.push(this.hover);
    let draw = pts;
    if (this.shape === 'arc' && pts.length === 3 && this.tool !== 'calibrate') draw = arcPoints(pts[0], pts[1], pts[2], 48);
    this.rubber.geometry.dispose();
    this.rubber.geometry = new THREE.BufferGeometry().setFromPoints(draw.map(([x, z]) => new THREE.Vector3(x, 3, z)));
    this.rubber.visible = draw.length >= 2;
  }

  private hitObject(e: PointerEvent): THREE.Object3D | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.cam);
    const targets: THREE.Object3D[] = [];
    if (this.layers.items) targets.push(this.gItems);
    targets.push(this.gWalls);
    const hits = this.ray.intersectObjects(targets, true).filter((h) => h.object.visible && h.object.userData.sel && !(h.object as THREE.LineSegments).isLineSegments);
    return hits[0]?.object ?? null;
  }

  // ───────────────────────── 입력 ─────────────────────────
  private onKey = (e: KeyboardEvent) => {
    this.shift = e.shiftKey;
    if (e.type !== 'keydown') return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === 'Escape') this.cancel();
    if (e.key === 'Enter') this.finish();
  };

  cancel() { this.pts = []; this.updateRubber(); }

  finish() {
    if (this.tool === 'array' && this.shape === 'line' && this.pts.length >= 2) this.cb.onSegment('line', this.pts);
    this.pts = []; this.updateRubber();
  }

  private onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY, button: e.button };
    if (e.button !== 0 || this.tool !== 'select') return;
    const o = this.hitObject(e);
    const sel = o?.userData.sel as Selection | undefined;
    if (sel?.type === 'item') {
      let grp: THREE.Object3D | null = o!;
      while (grp && grp.parent !== this.gItems) grp = grp.parent;
      const fp = this.floorPoint(e);
      if (grp && fp) {
        const it = grp.userData.item as Item;
        this.ctl3.enabled = false; this.ctl2.enabled = false;
        this.drag = { id: sel.id, grp, ox: grp.position.x - fp[0], oz: grp.position.z - fp[1], moved: false };
        if (it.segId) { this.drag = null; this.setView(this.view); }
      }
    }
  };

  private onMove = (e: PointerEvent) => {
    this.shift = e.shiftKey;
    const fp = this.floorPoint(e);
    if (!fp) return;
    if (this.drag) {
      let x = fp[0] + this.drag.ox, z = fp[1] + this.drag.oz;
      if (this.snapGrid) { x = Math.round(x / 5) * 5; z = Math.round(z / 5) * 5; }
      this.drag.grp.position.x = x; this.drag.grp.position.z = z;
      this.drag.moved = true;
      this.refreshHighlight();
      this.cb.onStatus(`X ${x.toFixed(0)} · Z ${z.toFixed(0)} cm`);
      return;
    }
    if (this.tool === 'select') { this.marker.visible = false; return; }
    const { p, snapped } = this.snap(fp);
    this.hover = p;
    this.marker.visible = true;
    this.marker.position.set(p[0], 4, p[1]);
    (this.marker.material as THREE.MeshBasicMaterial).color.set(snapped ? 0x34c759 : 0xff3b30);
    this.marker.scale.setScalar(this.worldPerPx());
    this.updateRubber();
    const last = this.pts[this.pts.length - 1];
    if (last) this.cb.onStatus(`길이 ${dist(last, p).toFixed(0)} cm${snapped ? ' · 스냅' : ''}  (Shift 직교, Esc 취소)`);
  };

  private onUp = (e: PointerEvent) => {
    const d = this.down; this.down = null;
    if (this.drag) {
      const dr = this.drag; this.drag = null;
      this.setView(this.view);
      if (dr.moved) this.cb.onMoveItem(dr.id, dr.grp.position.x, dr.grp.position.z);
      else this.cb.onSelect({ type: 'item', id: dr.id });
      return;
    }
    if (!d || e.button !== 0 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) {
      if (d && e.button === 2 && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 5 && this.view === '2d') this.finish();
      return;
    }
    if (this.tool === 'select') {
      const o = this.hitObject(e);
      this.cb.onSelect((o?.userData.sel as Selection) ?? null);
      return;
    }
    const fp = this.floorPoint(e); if (!fp) return;
    const { p } = this.snap(fp);
    const last = this.pts[this.pts.length - 1];
    const same = last && dist(last, p) < 0.5;
    switch (this.tool) {
      case 'place': this.cb.onPlace(p); return;
      case 'calibrate':
        if (same) return;
        this.pts.push(p);
        if (this.pts.length === 2) { const [a, b] = this.pts; this.pts = []; this.cb.onCalibrate(a, b); }
        break;
      case 'wall':
      case 'glass': {
        const glass = this.tool === 'glass';
        if (this.shape === 'arc') {
          if (same) return;
          this.pts.push(p);
          if (this.pts.length === 3) { const [a, m, c] = this.pts; this.pts = []; this.cb.onWallPath(arcPoints(a, m, c, this.arcN), glass); }
        } else {
          if (same) { this.pts = []; break; }
          if (last) this.cb.onWall(last, p, glass);
          this.pts = [p];
        }
        break;
      }
      case 'array':
        if (this.shape === 'arc') {
          if (same) return;
          this.pts.push(p);
          if (this.pts.length === 3) { const pts = this.pts; this.pts = []; this.cb.onSegment('arc', pts); }
        } else {
          if (same) { this.finish(); return; }
          this.pts.push(p);
        }
        break;
    }
    this.updateRubber();
  };

  private onDbl = () => {
    if ((this.tool === 'wall' || this.tool === 'glass') && this.shape === 'line') { this.pts = []; this.updateRubber(); }
    if (this.tool === 'array' && this.shape === 'line') this.finish();
  };

  // ───────────────────────── 내보내기 ─────────────────────────
  async exportGLB(): Promise<ArrayBuffer> {
    const root = new THREE.Group();
    root.name = 'STORE_ROOT';
    root.userData = { unit: 'm', source: 'store-planner', upAxis: 'Y' };
    root.scale.setScalar(0.01);
    const add = (o: THREE.Object3D) => {
      if (!o.visible) return;
      const c = o.clone(true);
      const strip: THREE.Object3D[] = [];
      c.traverse((x) => { if (x.userData.noExport) strip.push(x); x.userData = { ...x.userData, sel: undefined, item: undefined }; });
      strip.forEach((x) => x.parent?.remove(x));
      root.add(c);
    };
    this.gFloor.children.forEach(add);
    this.gWalls.children.forEach(add);
    if (this.layers.items) this.gItems.children.forEach(add);
    const ex = new GLTFExporter();
    const out = await ex.parseAsync(root, { binary: true, onlyVisible: true });
    return out as ArrayBuffer;
  }

  screenshot(scale = 2): string {
    const r = this.renderer;
    const w = this.el.clientWidth, h = this.el.clientHeight;
    const pr = r.getPixelRatio();
    const hl = this.highlight, gt = this.gTool.visible;
    if (hl) hl.visible = false;
    this.gTool.visible = false;
    r.setPixelRatio(scale);
    r.setSize(w, h, false);
    r.render(this.scene, this.cam);
    const url = r.domElement.toDataURL('image/png');
    r.setPixelRatio(pr);
    r.setSize(w, h);
    if (hl) hl.visible = true;
    this.gTool.visible = gt;
    return url;
  }
}
