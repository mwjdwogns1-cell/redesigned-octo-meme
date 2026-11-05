'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useGuard } from '@/lib/auth';
import { useAdminData, type AdminData } from '@/lib/adminData';
import { supabase } from '@/lib/supabase';
import {
  BAND_LABEL, HIGH_PLACE, MISSING_OPTIONS, QUARTERS, QUARTER_LABEL, STATUS_LABEL, UNKNOWN, URGENCY_LABEL, URGENCY_ORDER, WORK_WHEN,
} from '@/lib/constants';
import { Chips, Modal, Shell, Spinner, StatusBadge, UrgencyBadge, useToast } from '@/components/ui';
import { PhotoImg } from '@/components/photo';
import type { Item, ItemPhoto, ItemStatus, Quarter, Urgency } from '@/lib/types';

export default function ApprovalsPage() {
  return <Suspense fallback={<Spinner />}><Approvals /></Suspense>;
}

type Action = 'approve' | 'reject' | 'hold' | null;

function Approvals() {
  const profile = useGuard('admin');
  const sp = useSearchParams();
  const { data, error, reload } = useAdminData(!!profile);
  const { toast, node } = useToast();

  const [fStore, setFStore] = useState(sp.get('store') ?? '');
  const [fCat, setFCat] = useState(sp.get('category') ?? '');
  const [fUrg, setFUrg] = useState('');
  const [fQ, setFQ] = useState('');
  const [fStatus, setFStatus] = useState(sp.get('status') ?? 'submitted');
  const [fSurvey, setFSurvey] = useState(sp.get('survey') === '1');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    if (!data) return [];
    return data.items
      .filter((i) => i.status !== 'draft')
      .filter((i) => (!fStore || i.store_id === fStore) && (!fCat || i.category_id === fCat) && (!fUrg || i.urgency === fUrg)
        && (!fQ || i.quarter === fQ) && (fStatus === 'all' || i.status === fStatus) && (!fSurvey || i.needs_survey))
      .sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] || a.created_at.localeCompare(b.created_at));
  }, [data, fStore, fCat, fUrg, fQ, fStatus, fSurvey]);

  const selectable = list.filter((i) => i.status === 'submitted' || i.status === 'held');
  useEffect(() => { setSel((s) => new Set([...s].filter((id) => selectable.some((i) => i.id === id)))); /* 필터 변경 시 보이지 않는 선택 해제 */ }, [fStore, fCat, fUrg, fQ, fStatus, fSurvey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile) return <Spinner />;
  const storeName = (id: string) => data?.stores.find((s) => s.id === id)?.name ?? '';
  const catName = (id: string) => data?.categories.find((c) => c.id === id)?.name ?? '';
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = selectable.length > 0 && selectable.every((i) => sel.has(i.id));

  async function run(kind: Exclude<Action, null>, p: { reason?: string; missing?: string[]; band?: string }) {
    setBusy(true);
    const { data: n, error: e } = await supabase().rpc('admin_review_items', {
      p_ids: [...sel], p_action: kind, p_reason: p.reason ?? null, p_missing: p.missing ?? [], p_band: p.band ?? null,
    });
    setBusy(false);
    if (e) return toast('처리하지 못했습니다: ' + e.message, true);
    toast(`${n}건 ${kind === 'approve' ? '승인' : kind === 'reject' ? '반려' : '보류'} 처리`);
    setAction(null); setSel(new Set()); await reload();
  }

  return (
    <Shell role="admin" title="일괄 승인" wide>
      {node}
      {error && <div className="card mb-3 text-sm text-red-600">{error}</div>}
      {!data ? <Spinner /> : (
        <>
          <div className="card mb-3 grid grid-cols-2 gap-2 md:grid-cols-6">
            <select className="input" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="submitted">제출(승인 대기)</option><option value="held">보류</option><option value="approved">승인</option>
              <option value="rejected">반려</option><option value="all">전체</option>
            </select>
            <select className="input" value={fStore} onChange={(e) => setFStore(e.target.value)}>
              <option value="">전체 지점</option>{data.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="input" value={fCat} onChange={(e) => setFCat(e.target.value)}>
              <option value="">전체 분류</option>{data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="input" value={fUrg} onChange={(e) => setFUrg(e.target.value)}>
              <option value="">전체 긴급도</option>{(['urgent', 'normal', 'low'] as Urgency[]).map((u) => <option key={u} value={u}>{URGENCY_LABEL[u]}</option>)}
            </select>
            <select className="input" value={fQ} onChange={(e) => setFQ(e.target.value)}>
              <option value="">전체 분기</option>{QUARTERS.map((q) => <option key={q} value={q}>{QUARTER_LABEL[q]}</option>)}
            </select>
            <button className={`chip ${fSurvey ? '!border-amber-500 !bg-amber-500 text-white' : ''}`} onClick={() => setFSurvey(!fSurvey)}>실사 필요만</button>
          </div>

          <div className="mb-2 flex items-center justify-between text-sm">
            <button className="min-h-[44px] font-semibold text-brand disabled:text-slate-400" disabled={!selectable.length}
              onClick={() => setSel(allOn ? new Set() : new Set(selectable.map((i) => i.id)))}>{allOn ? '전체 해제' : `전체 선택 (${selectable.length})`}</button>
            <span className="text-slate-500">{list.length}건</span>
          </div>

          <div className="space-y-2 pb-28">
            {list.map((i) => (
              <Row key={i.id} item={i} data={data} store={storeName(i.store_id)} cat={catName(i.category_id)}
                checked={sel.has(i.id)} selectable={i.status === 'submitted' || i.status === 'held'} onToggle={() => toggle(i.id)}
                expanded={open === i.id} onExpand={() => setOpen(open === i.id ? null : i.id)}
                onAdjusted={async () => { toast('분기·긴급도를 수정했습니다 (이력 기록)'); await reload(); }} onError={(m) => toast(m, true)} />
            ))}
            {!list.length && <div className="card text-center text-slate-500">조건에 맞는 항목이 없습니다.</div>}
          </div>

          {sel.size > 0 && (
            <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 border-t border-slate-200 bg-white p-3 shadow-[0_-4px_12px_rgba(0,0,0,.06)]">
              <div className="mx-auto flex max-w-6xl items-center gap-2">
                <span className="w-16 shrink-0 text-sm font-bold">{sel.size}건</span>
                <button className="btn-primary flex-1" onClick={() => setAction('approve')}>승인</button>
                <button className="btn-danger flex-1" onClick={() => setAction('reject')}>반려</button>
                <button className="btn-warn flex-1" onClick={() => setAction('hold')}>보류</button>
              </div>
            </div>
          )}
          {action && <ActionModal kind={action} count={sel.size} busy={busy} onClose={() => setAction(null)} onRun={run} />}
        </>
      )}
    </Shell>
  );
}

function Row({ item: i, data, store, cat, checked, selectable, onToggle, expanded, onExpand, onAdjusted, onError }: {
  item: Item; data: AdminData; store: string; cat: string; checked: boolean; selectable: boolean; onToggle: () => void;
  expanded: boolean; onExpand: () => void; onAdjusted: () => void; onError: (m: string) => void;
}) {
  return (
    <div className={`card ${checked ? 'ring-2 ring-brand' : ''}`}>
      <div className="flex items-start gap-3">
        {selectable ? (
          <input type="checkbox" className="mt-1 h-6 w-6 shrink-0 accent-[#1428A0]" checked={checked} onChange={onToggle} aria-label="선택" />
        ) : <span className="w-6 shrink-0" />}
        <button className="min-w-0 flex-1 text-left" onClick={onExpand}>
          <div className="flex flex-wrap items-center gap-1.5">
            <b>{store}</b><span className="text-slate-500">· {cat}</span>
            <UrgencyBadge urgency={i.urgency} /><StatusBadge status={i.status as ItemStatus} />
            {i.needs_survey && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">실사 필요</span>}
          </div>
          <p className="mt-1 truncate text-sm text-slate-700">{i.area} · {i.location_detail} — {i.symptom}</p>
          <p className="text-xs text-slate-500">{QUARTER_LABEL[i.quarter]}{i.qty != null && ` · ${i.qty}${i.unit}`}{i.estimate_band && ` · 예상 ${BAND_LABEL[i.estimate_band]}`}</p>
        </button>
      </div>
      {expanded && <Detail item={i} data={data} onAdjusted={onAdjusted} onError={onError} />}
    </div>
  );
}

function Detail({ item: i, data, onAdjusted, onError }: { item: Item; data: AdminData; onAdjusted: () => void; onError: (m: string) => void }) {
  const [photos, setPhotos] = useState<ItemPhoto[] | null>(null);
  const [q, setQ] = useState<Quarter>(i.quarter);
  const [u, setU] = useState<Urgency>(i.urgency);
  const cat = data.categories.find((c) => c.id === i.category_id);
  useEffect(() => { supabase().from('item_photos').select('*').eq('item_id', i.id).then(({ data: d }) => setPhotos((d ?? []) as ItemPhoto[])); }, [i.id]);
  const dirty = q !== i.quarter || u !== i.urgency;
  const rows: [string, string][] = [
    ['범위·수량', i.qty_unknown ? '모름 - 현장 실사 필요' : `${i.qty}${i.unit}`],
    ['발생 시기', i.onset],
    ['영업 중 작업', WORK_WHEN[i.work_when]],
    ['고소·사다리', HIGH_PLACE[i.high_place]],
    ...(cat?.required_fields ?? []).map((f): [string, string] => [f.label, i.extra[f.key] === UNKNOWN ? '모름 (실사 필요)' : `${i.extra[f.key] ?? '-'}${f.unit && i.extra[f.key] && i.extra[f.key] !== UNKNOWN ? f.unit : ''}`]),
  ];
  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm md:grid-cols-3">
        {rows.map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>)}
      </dl>
      {i.reject_reason && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm">사유: {i.reject_reason}{i.reject_missing?.length ? ` (${i.reject_missing.join(', ')})` : ''}</p>}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {photos?.map((p) => <PhotoImg key={p.id} path={p.path} className="aspect-square w-full rounded-xl" />)}
        {photos && !photos.length && <p className="col-span-3 text-sm text-red-600">사진 없음</p>}
      </div>
      {(i.status === 'submitted' || i.status === 'held' || i.status === 'approved') && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <div className="mb-1 text-xs font-semibold text-slate-500">분기·긴급도 수정 (이력 기록)</div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input !w-auto" value={q} onChange={(e) => setQ(e.target.value as Quarter)}>{QUARTERS.map((x) => <option key={x} value={x}>{QUARTER_LABEL[x]}</option>)}</select>
            <select className="input !w-auto" value={u} onChange={(e) => setU(e.target.value as Urgency)}>{(['urgent', 'normal', 'low'] as Urgency[]).map((x) => <option key={x} value={x}>{URGENCY_LABEL[x]}</option>)}</select>
            <button className="btn-outline" disabled={!dirty} onClick={async () => {
              const { error } = await supabase().rpc('admin_adjust_item', { p_id: i.id, p_quarter: q, p_urgency: u });
              error ? onError('수정하지 못했습니다: ' + error.message) : onAdjusted();
            }}>적용</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionModal({ kind, count, busy, onClose, onRun }: {
  kind: Exclude<Action, null>; count: number; busy: boolean; onClose: () => void;
  onRun: (k: Exclude<Action, null>, p: { reason?: string; missing?: string[]; band?: string }) => void;
}) {
  const [band, setBand] = useState('');
  const [reason, setReason] = useState('');
  const [lack, setLack] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const title = kind === 'approve' ? `${count}건 승인` : kind === 'reject' ? `${count}건 반려` : `${count}건 보류`;
  const canRun = kind !== 'reject' || reason.trim() !== '' || (lack && missing.length > 0);
  return (
    <Modal title={title} onClose={onClose}>
      {kind === 'approve' && (
        <>
          <p className="mb-2 text-sm text-slate-600">예상 금액 구간 (선택, 모르면 비워 두세요). 선택한 건 모두에 같은 구간이 적용됩니다.</p>
          <Chips options={['lt50', '50to200', 'gt200']} labels={BAND_LABEL} value={band} onChange={(v) => setBand(band === v ? '' : v)} />
        </>
      )}
      {kind === 'reject' && (
        <>
          <button className={`chip mb-3 w-full ${lack ? '!border-red-600 !bg-red-600 text-white' : ''}`} onClick={() => setLack(!lack)}>정보 부족 (부족한 항목 체크)</button>
          {lack && (
            <div className="mb-3 grid grid-cols-2 gap-2">
              {MISSING_OPTIONS.map((m) => (
                <button key={m} className={`chip ${missing.includes(m) ? 'chip-on' : ''}`}
                  onClick={() => setMissing(missing.includes(m) ? missing.filter((x) => x !== m) : [...missing, m])}>{m}</button>
              ))}
            </div>
          )}
          <textarea className="input !min-h-[88px] py-2" placeholder="반려 사유 (정보 부족을 고르면 선택 입력)" value={reason} onChange={(e) => setReason(e.target.value)} />
        </>
      )}
      {kind === 'hold' && <textarea className="input !min-h-[88px] py-2" placeholder="보류 사유 (선택)" value={reason} onChange={(e) => setReason(e.target.value)} />}
      <button className="btn-primary mt-4 w-full" disabled={busy || !canRun}
        onClick={() => onRun(kind, {
          band: band || undefined,
          reason: kind === 'reject' ? (reason.trim() || (lack ? '정보 부족' : '')) : reason.trim() || undefined,
          missing: kind === 'reject' && lack ? missing : [],
        })}>{busy ? '처리 중…' : '확인'}</button>
      {kind === 'reject' && !canRun && <p className="err mt-2">반려 사유를 입력하거나 정보 부족 항목을 체크하세요</p>}
    </Modal>
  );
}
