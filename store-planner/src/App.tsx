import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Item, LibItem, Project, Pt, Segment } from './types';
import { Engine, loadModel, type Layers, type Selection, type Shape, type Tool } from './engine';
import { DEFAULT_LIBRARY } from './library';
import {
  cloneProject, download, itemFromLib, libFromModels, newProject, normalizeProject, readAs, regenSegment,
  removeWall, sampleProject, tally, tallyCSV,
} from './project';
import { decodeText, parseDxf } from './dxf';
import { dist, expandSegment, uid } from './geom';

const LS_KEY = 'store-planner:project';
const LS_LIB = 'store-planner:library';

function loadInitial(): Project {
  try {
    const s = localStorage.getItem(LS_KEY);
    if (s) return normalizeProject(JSON.parse(s));
  } catch { /* 저장소 사용 불가 */ }
  return sampleProject();
}
function loadLib(): LibItem[] {
  try { const s = localStorage.getItem(LS_LIB); if (s) return JSON.parse(s); } catch { /* */ }
  return DEFAULT_LIBRARY;
}

export default function App() {
  const vpRef = useRef<HTMLDivElement>(null);
  const engRef = useRef<Engine | null>(null);
  const [project, setProject] = useState<Project>(loadInitial);
  const [past, setPast] = useState<Project[]>([]);
  const [future, setFuture] = useState<Project[]>([]);
  const [baseLib, setBaseLib] = useState<LibItem[]>(loadLib);
  const [activeLib, setActiveLib] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [shape, setShape] = useState<Shape>('line');
  const [view, setView] = useState<'2d' | '3d'>('2d');
  const [sel, setSel] = useState<Selection>(null);
  const [status, setStatus] = useState('');
  const [snap, setSnap] = useState(true);
  const [layers, setLayers] = useState<Layers>({ walls: true, glass: true, items: true, underlay: true, segs: true });
  const [wallT, setWallT] = useState(15);
  const [glassH, setGlassH] = useState(270);
  const [arcN, setArcN] = useState(12);
  const [segDef, setSegDef] = useState<Pick<Segment, 'align' | 'side' | 'remainder' | 'gap'>>({ align: 'center', side: 'back', remainder: 'none', gap: 0 });
  const [libFilter, setLibFilter] = useState('');

  const lib = useMemo(() => [...baseLib, ...libFromModels(project)], [baseLib, project.models]); // eslint-disable-line react-hooks/exhaustive-deps
  const libById = useMemo(() => new Map(lib.map((l) => [l.id, l])), [lib]);
  const projRef = useRef(project); projRef.current = project;
  const libRef = useRef(libById); libRef.current = libById;
  const actRef = useRef(activeLib); actRef.current = activeLib;
  const segDefRef = useRef(segDef); segDefRef.current = segDef;
  const wallRef = useRef({ wallT, glassH }); wallRef.current = { wallT, glassH };

  /** 변경 커밋 (실행 취소 기록 포함) */
  const commit = useCallback((fn: (p: Project) => void) => {
    const prev = projRef.current;
    const next = cloneProject(prev);
    fn(next);
    next.floor.plan.rev = (next.floor.plan.rev || 0) + 1;
    setPast((h) => [...h.slice(-49), prev]);
    setFuture([]);
    setProject(next);
  }, []);

  // ── 엔진 생성 ──
  useEffect(() => {
    const el = vpRef.current!;
    const eng = new Engine(el, {
      onSelect: (s) => setSel(s),
      onStatus: (t) => setStatus(t),
      onWall: (a, b, glass) => addWalls([a, b], glass),
      onWallPath: (pts, glass) => addWalls(pts, glass),
      onSegment: (type, pts) => {
        const libId = actRef.current;
        const li = libId ? libRef.current.get(libId) : undefined;
        if (!li) { alert('왼쪽 라이브러리에서 배치할 아이템을 먼저 선택하세요.'); return; }
        const seg: Segment = { id: uid('sg'), type, pts, libId: li.id, ...segDefRef.current };
        let info = { count: 0, rest: 0, length: 0 };
        commit((p) => { p.segments = [...(p.segments || []), seg]; info = regenSegment(p, seg, li); });
        setStatus(`구간 ${Math.round(info.length)}cm · ${li.name} ${info.count}개 · 남는 길이 ${Math.round(info.rest)}cm`);
      },
      onPlace: (pt) => {
        const li = actRef.current ? libRef.current.get(actRef.current) : undefined;
        if (!li) return;
        const it = itemFromLib(li, pt[0], pt[1]);
        commit((p) => { p.items.push(it); });
        setSel({ type: 'item', id: it.id });
      },
      onMoveItem: (id, x, z) => commit((p) => {
        const it = p.items.find((i) => i.id === id);
        if (it) { it.x = Math.round(x * 10) / 10; it.z = Math.round(z * 10) / 10; }
      }),
      onCalibrate: (a, b) => calibrate(a, b),
    });
    engRef.current = eng;
    eng.setView('2d');
    eng.setProject(projRef.current);
    eng.setTool('select');
    return () => eng.dispose();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addWalls = (pts: Pt[], glass: boolean) => {
    const { wallT: t, glassH: gh } = wallRef.current;
    commit((p) => {
      const pl = p.floor.plan;
      for (let i = 1; i < pts.length; i++) {
        if (dist(pts[i - 1], pts[i]) < 1) continue;
        const idx = pl.solids.length / 5;
        pl.solids.push(r1(pts[i - 1][0]), r1(pts[i - 1][1]), r1(pts[i][0]), r1(pts[i][1]), glass ? 2 : t);
        if (glass) pl.wallStyle[String(idx)] = { kind: 'glass', h: gh, decals: [] };
      }
    });
  };

  const calibrate = (a: Pt, b: Pt) => {
    const measured = dist(a, b);
    const v = prompt(`두 점 사이 현재 길이: ${(measured * 10).toFixed(0)} mm\n실제 길이를 mm로 입력하세요 (예: 2400)`);
    const real = Number(v) / 10;
    if (!real || !isFinite(real) || measured < 0.1) return;
    const k = real / measured;
    commit((p) => {
      const ref = p.floor.underlay.ref; if (!ref) return;
      if (p.underlays[ref]) {
        p.underlays[ref] = {
          layers: p.underlays[ref].layers.map((l) => ({
            ...l, segs: l.segs.map((val, i) => Math.round(((i % 2 === 0 ? a[0] : a[1]) + (val - (i % 2 === 0 ? a[0] : a[1])) * k) * 10) / 10),
          })),
        };
      }
      const img = p.images[ref];
      if (img) p.images[ref] = { ...img, w: img.w * k, d: img.d * k, x: a[0] + (img.x - a[0]) * k, z: a[1] + (img.z - a[1]) * k };
    });
    setStatus(`축척 적용: ×${k.toFixed(4)}`);
    pickTool('select');
  };

  // ── 엔진 동기화 ──
  useEffect(() => { engRef.current?.setProject(project); }, [project]);
  useEffect(() => { engRef.current?.setSelection(sel); }, [sel, project]);
  useEffect(() => { engRef.current?.setLayers(layers); }, [layers, view]);
  useEffect(() => { if (engRef.current) engRef.current.snapGrid = snap; }, [snap]);
  useEffect(() => { if (engRef.current) engRef.current.arcN = arcN; }, [arcN]);
  useEffect(() => { engRef.current?.setView(view); engRef.current?.setLayers(layers); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 자동 저장 ──
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const s = JSON.stringify(project);
        if (s.length < 4_500_000) localStorage.setItem(LS_KEY, s);
      } catch { /* 용량 초과 등은 무시 */ }
    }, 600);
    return () => clearTimeout(t);
  }, [project]);

  const pickTool = (t: Tool, s?: Shape) => {
    const sh = s ?? shape;
    setTool(t); if (s) setShape(s);
    engRef.current?.setTool(t, sh);
  };

  const undo = useCallback(() => {
    setPast((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setFuture((f) => [projRef.current, ...f]);
      setProject(prev);
      return h.slice(0, -1);
    });
  }, []);
  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const [n, ...rest] = f;
      setPast((h) => [...h, projRef.current]);
      setProject(n);
      return rest;
    });
  }, []);

  const selItem = sel?.type === 'item' ? project.items.find((i) => i.id === sel.id) : undefined;
  const selSeg = selItem?.segId ? (project.segments || []).find((s) => s.id === selItem.segId) : undefined;

  const deleteSelection = useCallback(() => {
    const s = sel; if (!s) return;
    if (s.type === 'wall') commit((p) => removeWall(p, s.idx));
    else {
      const it = projRef.current.items.find((i) => i.id === s.id);
      if (it?.segId) {
        const sid = it.segId;
        commit((p) => { p.segments = (p.segments || []).filter((g) => g.id !== sid); p.items = p.items.filter((i) => i.segId !== sid); });
      } else commit((p) => { p.items = p.items.filter((i) => i.id !== s.id); });
    }
    setSel(null);
  }, [sel, commit]);

  const rotateSel = useCallback((deg: number) => {
    if (sel?.type !== 'item') return;
    commit((p) => { const it = p.items.find((i) => i.id === sel.id); if (it && !it.segId) it.rot = (((it.rot + deg) % 360) + 360) % 360; });
  }, [sel, commit]);

  const duplicateSel = useCallback(() => {
    if (!selItem || selItem.segId) return;
    const c: Item = { ...structuredClone(selItem), id: uid('i'), x: selItem.x + 30, z: selItem.z + 30 };
    commit((p) => { p.items.push(c); });
    setSel({ type: 'item', id: c.id });
  }, [selItem, commit]);

  // ── 단축키 ──
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); duplicateSel(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection();
      if (k === 'q') rotateSel(e.shiftKey ? -90 : -15);
      if (k === 'e') rotateSel(e.shiftKey ? 90 : 15);
      if (k === 'v') pickTool('select');
      if (k === 'w') pickTool('wall');
      if (k === 'g') pickTool('glass');
      if (k === 'a') pickTool('array');
      if (e.key === 'Escape' && tool !== 'select' && !e.repeat) { /* 엔진이 진행 중 입력 취소 */ }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  // ── 파일 ──
  const fileRef = useRef<HTMLInputElement>(null);
  const fileMode = useRef<'project' | 'dxf' | 'image' | 'glb' | 'link' | 'lib'>('project');
  const openFile = (mode: typeof fileMode.current, accept: string, multiple = false) => {
    fileMode.current = mode;
    const el = fileRef.current!;
    el.accept = accept; el.multiple = multiple; el.value = '';
    el.click();
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const mode = fileMode.current;
    try {
      if (mode === 'project') {
        const p = normalizeProject(JSON.parse(String(await readAs(files[0], 'text'))));
        setPast((h) => [...h, projRef.current]); setFuture([]);
        setProject(p); setSel(null);
        setTimeout(() => engRef.current?.fit(), 50);
        const missing = Object.values(p.models).filter((m) => !m.data).length;
        setStatus(`불러옴: 아이템 ${p.items.length}개, 벽 ${p.floor.plan.solids.length / 5}개` + (missing ? ` · 파일 없는 3D 모델 ${missing}종은 박스로 표시 ([모델 연결]로 glb 지정)` : ''));
      } else if (mode === 'dxf') {
        const f = files[0];
        if (/\.dwg$/i.test(f.name)) { alert('DWG는 브라우저에서 읽을 수 없습니다. 캐드에서 DXF로 저장한 뒤 올려주세요.'); return; }
        const text = await decodeText(await readAs(f, 'buffer') as ArrayBuffer);
        const r = parseDxf(text);
        const ref = uid('ul');
        const fit = confirm(`도면 크기 약 ${Math.round(r.width)} × ${Math.round(r.depth)} cm (${r.unitNote}).\n바닥 크기를 도면 크기에 맞출까요?`);
        commit((p) => {
          p.underlays = { [ref]: r.data };
          p.images = {};
          p.floor.underlay = { ref, visible: true, opacity: 1, hidden: [] };
          if (fit) { p.floor.w = Math.ceil(r.width / 10) * 10 + 40; p.floor.d = Math.ceil(r.depth / 10) * 10 + 40; }
        });
        setLayers((l) => ({ ...l, underlay: true }));
        setTimeout(() => engRef.current?.fit(), 50);
        setStatus(`DXF: 레이어 ${r.data.layers.length}개, 선 ${r.segCount}개. 길이가 맞지 않으면 [축척 맞추기]`);
      } else if (mode === 'image') {
        const data = String(await readAs(files[0], 'dataURL'));
        const img = new Image();
        await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = data; });
        const ref = uid('ul');
        commit((p) => {
          const w = p.floor.w;
          p.images = { [ref]: { data, w, d: (w * img.naturalHeight) / img.naturalWidth, x: 0, z: 0 } };
          p.underlays = {};
          p.floor.underlay = { ref, visible: true, opacity: 0.8, hidden: [] };
        });
        setLayers((l) => ({ ...l, underlay: true }));
        alert('이미지를 깔았습니다. 실제 길이를 아는 두 점을 클릭해 축척을 맞추세요.\n(모니터를 찍은 사진은 원근 왜곡이 있어 부정확합니다. 원본 PDF/이미지를 권장합니다.)');
        pickTool('calibrate');
      } else if (mode === 'glb') {
        const added: string[] = [];
        const models: Project['models'] = {};
        for (const f of Array.from(files)) {
          const data = String(await readAs(f, 'dataURL'));
          const id = 'user:' + f.name;
          const r = await loadModel(id, data);
          if (!r) { alert(`${f.name}: glb를 읽지 못했습니다`); continue; }
          models[id] = { name: f.name.replace(/\.(glb|gltf)$/i, ''), ext: 'glb', data, url: '', w: r1(r.size.x), d: r1(r.size.z), h: r1(r.size.y) };
          added.push(models[id].name);
        }
        commit((p) => { Object.assign(p.models, models); });
        setStatus(`3D 모델 추가: ${added.join(', ')} (라이브러리 '3D 모델' 분류)`);
      } else if (mode === 'link') {
        let n = 0;
        const updates: Project['models'] = {};
        const cur = projRef.current.models;
        for (const f of Array.from(files)) {
          const key = Object.keys(cur).find((k) => (cur[k].url || k).split('/').pop()?.toLowerCase() === f.name.toLowerCase());
          if (!key) continue;
          updates[key] = { ...cur[key], data: String(await readAs(f, 'dataURL')) };
          n++;
        }
        commit((p) => { Object.assign(p.models, updates); });
        setStatus(`모델 연결: ${n}개 파일 매칭`);
      } else if (mode === 'lib') {
        const arr = JSON.parse(String(await readAs(files[0], 'text')));
        const items: LibItem[] = Array.isArray(arr) ? arr : arr.items;
        if (!Array.isArray(items)) throw new Error('라이브러리 형식이 아닙니다');
        setBaseLib(items);
        if (!Array.isArray(arr) && arr.models) commit((p) => { Object.assign(p.models, arr.models); });
        try { localStorage.setItem(LS_LIB, JSON.stringify(items)); } catch { /* */ }
        setStatus(`라이브러리 ${items.length}개 불러옴`);
      }
    } catch (err) {
      alert('파일 처리 실패: ' + (err as Error).message);
    }
  };

  const exportGLB = async () => {
    const buf = await engRef.current!.exportGLB();
    download('store-layout.glb', buf, 'model/gltf-binary');
  };
  const exportPNG = () => {
    const url = engRef.current!.screenshot(2);
    const a = document.createElement('a'); a.href = url; a.download = `store-${view}.png`; a.click();
  };

  // ── 구간 속성 변경 ──
  const updateSeg = (patch: Partial<Segment>) => {
    if (!selSeg) return;
    const segId = selSeg.id;
    commit((p) => {
      const s = (p.segments || []).find((g) => g.id === segId); if (!s) return;
      Object.assign(s, patch);
      regenSegment(p, s, libById.get(s.libId));
    });
    setSel(null);
    setTimeout(() => {
      const first = projRef.current.items.find((i) => i.segId === segId);
      if (first) setSel({ type: 'item', id: first.id });
    }, 0);
  };

  const t = useMemo(() => tally(project), [project]);
  const underlay = project.floor.underlay;
  const dxfLayers = underlay.ref ? project.underlays[underlay.ref]?.layers : undefined;
  const cats = useMemo(() => {
    const m = new Map<string, LibItem[]>();
    for (const l of lib) {
      if (libFilter && !l.name.toLowerCase().includes(libFilter.toLowerCase())) continue;
      if (!m.has(l.cat)) m.set(l.cat, []);
      m.get(l.cat)!.push(l);
    }
    return [...m.entries()];
  }, [lib, libFilter]);

  const wallInfo = sel?.type === 'wall' ? (() => {
    const s = project.floor.plan.solids, i = sel.idx * 5;
    const st = project.floor.plan.wallStyle[String(sel.idx)] || {};
    return { L: Math.hypot(s[i + 2] - s[i], s[i + 3] - s[i + 1]), t: s[i + 4], st };
  })() : null;

  const segInfo = selSeg ? (() => { const li = libById.get(selSeg.libId); return li ? expandSegment(selSeg, li) : null; })() : null;

  return (
    <div className="app">
      <header className="bar">
        <strong className="brand">매장 3D 플래너</strong>
        <div className="grp">
          <button onClick={() => { if (confirm('새 프로젝트를 시작할까요? (현재 작업은 실행취소로 복구 가능)')) commit((p) => Object.assign(p, newProject())); }}>새로</button>
          <button onClick={() => openFile('project', '.json')}>열기</button>
          <button onClick={() => download('store-plan.json', JSON.stringify(project), 'application/json')}>저장</button>
          <button onClick={() => { if (confirm('샘플 매장을 불러올까요?')) { commit((p) => Object.assign(p, sampleProject())); setTimeout(() => engRef.current?.fit(), 50); } }}>샘플</button>
        </div>
        <div className="grp">
          <button onClick={() => openFile('dxf', '.dxf,.dwg')}>도면 DXF</button>
          <button onClick={() => openFile('image', 'image/*')}>도면 이미지</button>
        </div>
        <div className="grp seg">
          <button className={view === '2d' ? 'on' : ''} onClick={() => setView('2d')}>2D 평면</button>
          <button className={view === '3d' ? 'on' : ''} onClick={() => setView('3d')}>3D</button>
        </div>
        {view === '3d' && <div className="grp">
          {(['iso', 'front', 'side', 'top'] as const).map((k) => <button key={k} onClick={() => engRef.current?.preset(k)}>{{ iso: '입체', front: '정면', side: '측면', top: '평면' }[k]}</button>)}
        </div>}
        <div className="grp">
          <button onClick={undo} disabled={!past.length} title="Ctrl+Z">↶</button>
          <button onClick={redo} disabled={!future.length} title="Ctrl+Y">↷</button>
        </div>
        <div className="grp right">
          <button onClick={() => download('집계표.csv', tallyCSV(project), 'text/csv')}>집계표(CSV)</button>
          <button onClick={exportPNG}>PNG</button>
          <button className="primary" onClick={exportGLB}>GLB 내보내기</button>
        </div>
      </header>

      <div className="bar tools">
        <div className="grp seg">
          {([['select', '선택 V'], ['wall', '벽 W'], ['glass', '유리 G'], ['array', '구간 배치 A'], ['calibrate', '축척 맞추기']] as [Tool, string][]).map(([k, label]) =>
            <button key={k} className={tool === k ? 'on' : ''} onClick={() => pickTool(k)}>{label}</button>)}
        </div>
        <div className="grp seg">
          <button className={shape === 'line' ? 'on' : ''} onClick={() => pickTool(tool, 'line')}>직선</button>
          <button className={shape === 'arc' ? 'on' : ''} onClick={() => pickTool(tool, 'arc')}>곡선(3점)</button>
        </div>
        <label><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> 스냅 10cm</label>
        {(['walls', 'glass', 'items', 'underlay', 'segs'] as (keyof Layers)[]).map((k) =>
          <label key={k}><input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} /> {{ walls: '벽', glass: '유리', items: '집기', underlay: '밑그림', segs: '구간선' }[k]}</label>)}
      </div>

      <aside className="left">
        <div className="ttl">집기 라이브러리</div>
        <div className="hint">아이템 선택 후 → 클릭 배치, 또는 [구간 배치]로 선을 따라 자동 배열</div>
        <input className="search" placeholder="검색" value={libFilter} onChange={(e) => setLibFilter(e.target.value)} />
        {cats.map(([cat, items]) => (
          <div key={cat}>
            <div className="cat">{cat}</div>
            {items.map((l) => (
              <button key={l.id} className={'lib ' + (activeLib === l.id ? 'on' : '')}
                onClick={() => { setActiveLib(l.id); if (tool !== 'array') pickTool('place'); }}>
                <span>{l.name}</span><small>{Math.round(l.w)}×{Math.round(l.d)}×{Math.round(l.h)}</small>
              </button>
            ))}
          </div>
        ))}
        <div className="libtools">
          <button onClick={() => openFile('glb', '.glb,.gltf', true)}>+ glb 모델 추가</button>
          <button onClick={() => openFile('link', '.glb', true)} title="불러온 저장본의 모델 파일명을 맞춰 연결">모델 연결</button>
          <button onClick={() => openFile('lib', '.json')}>라이브러리 불러오기</button>
          <button onClick={() => download('library.json', JSON.stringify(baseLib, null, 2), 'application/json')}>라이브러리 저장</button>
          <button onClick={() => { setBaseLib(DEFAULT_LIBRARY); try { localStorage.removeItem(LS_LIB); } catch { /* */ } }}>기본값</button>
        </div>
      </aside>

      <main className="vp" ref={vpRef}>
        <div className="status">{status}</div>
        {activeLib && (tool === 'place' || tool === 'array') && <div className="active">활성 아이템: {libById.get(activeLib)?.name}</div>}
      </main>

      <aside className="right">
        {selItem && !selSeg && (
          <section>
            <div className="ttl">선택: {selItem.name}</div>
            <div className="form">
              {(['w', 'd', 'h', 'x', 'z', 'rot', 'y0'] as const).map((k) => (
                <label key={k}>{{ w: '가로 W', d: '깊이 D', h: '높이 H', x: 'X', z: 'Z', rot: '회전°', y0: '띄움' }[k]}
                  <input type="number" value={Number(selItem[k] ?? 0)} onChange={(e) => {
                    const v = Number(e.target.value);
                    commit((p) => { const it = p.items.find((i) => i.id === selItem.id); if (it) (it as Record<string, unknown>)[k] = v; });
                  }} /></label>
              ))}
              <label>색상<input type="color" value={selItem.color || '#cccccc'} onChange={(e) => commit((p) => { const it = p.items.find((i) => i.id === selItem.id); if (it) it.color = e.target.value; })} /></label>
            </div>
            <div className="row">
              <button onClick={() => rotateSel(-90)}>⟲ 90°</button>
              <button onClick={() => rotateSel(90)}>⟳ 90°</button>
              <button onClick={duplicateSel}>복제</button>
              <button className="danger" onClick={deleteSelection}>삭제</button>
            </div>
          </section>
        )}

        {selSeg && (
          <section>
            <div className="ttl">구간 배치</div>
            {segInfo && <div className="info">길이 {Math.round(segInfo.length)}cm · {segInfo.count}개 · 남는 길이 {Math.round(segInfo.rest)}cm</div>}
            <div className="form">
              <label className="wide">아이템
                <select value={selSeg.libId} onChange={(e) => updateSeg({ libId: e.target.value })}>
                  {lib.map((l) => <option key={l.id} value={l.id}>{l.name} ({Math.round(l.w)})</option>)}
                </select></label>
              <label>정렬<select value={selSeg.align} onChange={(e) => updateSeg({ align: e.target.value as Segment['align'] })}>
                <option value="start">시작점</option><option value="center">가운데</option></select></label>
              <label>면<select value={selSeg.side} onChange={(e) => updateSeg({ side: e.target.value as Segment['side'] })}>
                <option value="back">선=뒷면</option><option value="front">반대쪽</option><option value="center">선=중심</option></select></label>
              <label>남는 길이<select value={selSeg.remainder} onChange={(e) => updateSeg({ remainder: e.target.value as Segment['remainder'] })}>
                <option value="none">비워둠</option><option value="stretch">모듈 늘리기</option><option value="fill">보충재 추가</option></select></label>
              <label>간격(cm)<input type="number" value={selSeg.gap} onChange={(e) => updateSeg({ gap: Number(e.target.value) })} /></label>
            </div>
            <div className="row"><button className="danger" onClick={deleteSelection}>구간 삭제</button></div>
          </section>
        )}

        {wallInfo && sel?.type === 'wall' && (
          <section>
            <div className="ttl">{wallInfo.st.kind === 'glass' ? '유리' : '벽'} #{sel.idx}</div>
            <div className="info">길이 {Math.round(wallInfo.L)} cm</div>
            <div className="form">
              <label>두께<input type="number" value={wallInfo.t} onChange={(e) => commit((p) => { p.floor.plan.solids[sel.idx * 5 + 4] = Number(e.target.value); })} /></label>
              <label>높이<input type="number" value={wallInfo.st.h ?? project.floor.plan.h} onChange={(e) => commit((p) => { p.floor.plan.wallStyle[String(sel.idx)] = { ...wallInfo.st, h: Number(e.target.value) }; })} /></label>
              <label>띄움<input type="number" value={wallInfo.st.y0 ?? 0} onChange={(e) => commit((p) => { p.floor.plan.wallStyle[String(sel.idx)] = { ...wallInfo.st, y0: Number(e.target.value) }; })} /></label>
              <label>종류<select value={wallInfo.st.kind === 'glass' ? 'glass' : 'wall'} onChange={(e) => commit((p) => {
                const st = { ...wallInfo.st }; if (e.target.value === 'glass') st.kind = 'glass'; else delete st.kind;
                p.floor.plan.wallStyle[String(sel.idx)] = st;
              })}><option value="wall">벽</option><option value="glass">유리</option></select></label>
              <label>색상<input type="color" value={wallInfo.st.color || '#efece6'} onChange={(e) => commit((p) => { p.floor.plan.wallStyle[String(sel.idx)] = { ...wallInfo.st, color: e.target.value }; })} /></label>
            </div>
            <div className="row"><button className="danger" onClick={deleteSelection}>삭제</button></div>
          </section>
        )}

        <section>
          <div className="ttl">바닥 · 기본값</div>
          <div className="form">
            <label>바닥 가로<input type="number" value={project.floor.w} onChange={(e) => commit((p) => { p.floor.w = Number(e.target.value) || 100; })} /></label>
            <label>바닥 세로<input type="number" value={project.floor.d} onChange={(e) => commit((p) => { p.floor.d = Number(e.target.value) || 100; })} /></label>
            <label>벽 높이<input type="number" value={project.floor.plan.h} onChange={(e) => commit((p) => { p.floor.plan.h = Number(e.target.value) || 270; })} /></label>
            <label>벽 두께<input type="number" value={wallT} onChange={(e) => setWallT(Number(e.target.value) || 15)} /></label>
            <label>유리 높이<input type="number" value={glassH} onChange={(e) => setGlassH(Number(e.target.value) || 270)} /></label>
            <label>곡선 분할<input type="number" min={4} max={48} value={arcN} onChange={(e) => setArcN(Math.max(4, Math.min(48, Number(e.target.value) || 12)))} /></label>
          </div>
          <div className="info">면적 {(project.floor.w * project.floor.d / 10000).toFixed(1)}㎡ ({(project.floor.w * project.floor.d / 10000 / 3.3058).toFixed(1)}평) · 단위 cm</div>
        </section>

        <section>
          <div className="ttl">구간 배치 기본값</div>
          <div className="form">
            <label>정렬<select value={segDef.align} onChange={(e) => setSegDef({ ...segDef, align: e.target.value as Segment['align'] })}>
              <option value="start">시작점</option><option value="center">가운데</option></select></label>
            <label>면<select value={segDef.side} onChange={(e) => setSegDef({ ...segDef, side: e.target.value as Segment['side'] })}>
              <option value="back">선=뒷면</option><option value="front">반대쪽</option><option value="center">선=중심</option></select></label>
            <label>남는 길이<select value={segDef.remainder} onChange={(e) => setSegDef({ ...segDef, remainder: e.target.value as Segment['remainder'] })}>
              <option value="none">비워둠</option><option value="stretch">모듈 늘리기</option><option value="fill">보충재 추가</option></select></label>
            <label>간격<input type="number" value={segDef.gap} onChange={(e) => setSegDef({ ...segDef, gap: Number(e.target.value) || 0 })} /></label>
          </div>
        </section>

        {underlay.ref && (
          <section>
            <div className="ttl">도면 밑그림</div>
            <div className="form">
              <label>표시<input type="checkbox" checked={underlay.visible !== false} onChange={(e) => commit((p) => { p.floor.underlay.visible = e.target.checked; })} /></label>
              <label>진하기<input type="range" min={5} max={100} value={Math.round((underlay.opacity ?? 1) * 100)} onChange={(e) => commit((p) => { p.floor.underlay.opacity = Number(e.target.value) / 100; })} /></label>
            </div>
            <div className="row">
              <button onClick={() => pickTool('calibrate')}>축척 맞추기</button>
              <button className="danger" onClick={() => commit((p) => { p.floor.underlay = { ref: null, visible: true, opacity: 1, hidden: [] }; p.underlays = {}; p.images = {}; })}>밑그림 제거</button>
            </div>
            {dxfLayers && <div className="layers">
              {dxfLayers.map((l) => (
                <label key={l.name}><input type="checkbox" checked={!underlay.hidden.includes(l.name)} onChange={(e) => commit((p) => {
                  const h = new Set(p.floor.underlay.hidden); if (e.target.checked) h.delete(l.name); else h.add(l.name);
                  p.floor.underlay.hidden = [...h];
                })} /><i style={{ background: l.color }} />{l.name} <small>({l.segs.length / 4})</small></label>
              ))}
            </div>}
          </section>
        )}

        <section>
          <div className="ttl">집계표</div>
          <table className="tally"><tbody>
            {t.rows.map((r) => <tr key={r.name + r.size}><td>{r.name}<small>{r.size}</small></td><td>{r.count}</td></tr>)}
            <tr><td>벽체 총길이</td><td>{(t.wallLen / 100).toFixed(1)}m</td></tr>
            <tr><td>유리 총길이</td><td>{(t.glassLen / 100).toFixed(1)}m</td></tr>
          </tbody></table>
        </section>
      </aside>
      <input ref={fileRef} type="file" hidden onChange={(e) => onFiles(e.target.files)} />
    </div>
  );
}

const r1 = (v: number) => Math.round(v * 10) / 10;
