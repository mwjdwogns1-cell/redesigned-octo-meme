'use client';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useGuard } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { planYear, AREAS, ONSETS, QUARTERS, QUARTER_LABEL, URGENCY_LABEL, WORK_WHEN, HIGH_PLACE, PHOTO_KIND_LABEL, UNKNOWN, UNKNOWN_LABEL } from '@/lib/constants';
import { clearDraft, loadDraft, saveDraft } from '@/lib/draft';
import { compressImage } from '@/lib/image';
import { emptyForm, firstErrorStep, STEP_FIELDS, validateForm, type ItemForm, type PhotoRef } from '@/lib/validation';
import { Chips, Field, Shell, Spinner, useToast } from '@/components/ui';
import { PhotoImg, previewCache } from '@/components/photo';
import type { Category, FieldDef, Item, ItemPhoto, PhotoKind, Urgency } from '@/lib/types';

const STEP_TITLE = ['위치·현황', '범위·수량', '사진', '작업조건·우선순위'];
const KINDS: PhotoKind[] = ['wide', 'close', 'scale'];
const GUIDE: Record<PhotoKind, string> = {
  wide: '주변이 함께 보이게 멀리서', close: '문제 부위를 가까이서', scale: '줄자·기준물을 함께 놓고 크기 확인',
};

export default function ItemPage() {
  return <Suspense fallback={<Spinner />}><Wizard /></Suspense>;
}

function Wizard() {
  const profile = useGuard('staff');
  const sp = useSearchParams();
  const router = useRouter();
  const catId = sp.get('category');
  const editId = sp.get('id');
  const { toast, node } = useToast();

  const [cat, setCat] = useState<Category | null>(null);
  const [submissionId, setSubmissionId] = useState('');
  const [itemId, setItemId] = useState('');
  const [form, setForm] = useState<ItemForm | null>(null);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [upState, setUpState] = useState<Partial<Record<PhotoKind, 'uploading' | 'error'>>>({});
  const origPhotos = useRef<PhotoRef[]>([]);
  const failedFiles = useRef<Partial<Record<PhotoKind, File>>>({});
  const storeId = profile?.store_id ?? '';
  const draftKey = editId ? `edit:${editId}` : `new:${storeId}:${catId}`;
  const isNew = !editId;

  // 초기 로드: 분류, 제출서, (수정이면) 기존 항목·사진, 그리고 로컬 임시저장 복원
  useEffect(() => {
    if (!profile || !catId) return;
    (async () => {
      try {
        const sb = supabase();
        const { data: c, error: ce } = await sb.from('categories').select('*').eq('id', catId).single();
        if (ce) throw ce;
        const category = c as Category;
        const { data: sid, error: se } = await sb.rpc('ensure_submission', { p_year: planYear() });
        if (se) throw se;
        setCat(category); setSubmissionId(sid as string);

        let base: ItemForm = emptyForm(category);
        let id = crypto.randomUUID();
        if (editId) {
          id = editId;
          const [{ data: it, error: ie }, { data: ph }] = await Promise.all([
            sb.from('items').select('*').eq('id', editId).single(),
            sb.from('item_photos').select('*').eq('item_id', editId),
          ]);
          if (ie) throw ie;
          const item = it as Item;
          const photos = ((ph ?? []) as ItemPhoto[]).map((p) => ({ kind: p.kind, path: p.path, dbId: p.id }));
          origPhotos.current = photos;
          base = {
            area: item.area, location_detail: item.location_detail, symptom: item.symptom, onset: item.onset,
            qty: item.qty == null ? '' : String(item.qty), unit: item.unit ?? category.units[0] ?? '개', qty_unknown: item.qty_unknown,
            extra: item.extra ?? {}, photos, work_when: item.work_when, high_place: item.high_place, urgency: item.urgency, quarter: item.quarter,
          };
        }
        const draft = loadDraft<{ id: string; form: ItemForm }>(draftKey);
        if (draft && (editId || draft.form)) {
          id = editId ?? draft.id;
          base = { ...draft.form, photos: editId ? mergeDbIds(draft.form.photos, origPhotos.current) : draft.form.photos };
          toast('작성 중이던 내용을 복원했습니다');
        }
        setItemId(id); setForm(base);
      } catch (e: any) { setLoadErr(e?.message ?? '불러오지 못했습니다'); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, catId, editId]);

  // 자동 임시저장 (입력 즉시 로컬 보관)
  // 지연 없이 즉시 저장한다 (앱 전환·강제 종료 직전의 입력도 보존)
  useEffect(() => {
    if (!form || !itemId) return;
    saveDraft(draftKey, { id: itemId, form });
  }, [form, itemId, draftKey]);

  const set = useCallback(<K extends keyof ItemForm>(k: K, v: ItemForm[K]) => setForm((f) => (f ? { ...f, [k]: v } : f)), []);
  const setExtra = (key: string, v: string) => setForm((f) => (f ? { ...f, extra: { ...f.extra, [key]: v } } : f));

  const addPhoto = useCallback(async (kind: PhotoKind, file: File) => {
    setUpState((s) => ({ ...s, [kind]: 'uploading' }));
    try {
      const blob = await compressImage(file);
      const path = `${storeId}/${itemId}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase().storage.from('item-photos').upload(path, blob, { contentType: 'image/jpeg' });
      if (error) throw error;
      previewCache.set(path, URL.createObjectURL(blob));
      setForm((f) => (f ? { ...f, photos: [...f.photos.filter((p) => p.kind !== kind), { kind, path }] } : f));
      delete failedFiles.current[kind];
      setUpState((s) => { const n = { ...s }; delete n[kind]; return n; });
    } catch {
      failedFiles.current[kind] = file;
      setUpState((s) => ({ ...s, [kind]: 'error' }));
    }
  }, [storeId, itemId]);

  const removePhoto = (kind: PhotoKind) => setForm((f) => (f ? { ...f, photos: f.photos.filter((p) => p.kind !== kind) } : f));

  function next() {
    if (!cat || !form) return;
    const all = validateForm(form, cat);
    const mine = Object.fromEntries(Object.entries(all).filter(([k]) => STEP_FIELDS(cat)[step].includes(k)));
    setErrors(mine);
    if (Object.keys(mine).length) return toast('빈 칸을 확인하세요', true);
    setStep((s) => s + 1); window.scrollTo(0, 0);
  }

  async function save() {
    if (!cat || !form) return;
    const errs = validateForm(form, cat);
    setErrors(errs);
    if (Object.keys(errs).length) { setStep(firstErrorStep(errs, cat)); return toast('빈 칸을 확인하세요', true); }
    setBusy(true);
    try {
      const sb = supabase();
      const extra: Record<string, string> = {};
      for (const d of cat.required_fields) if ((form.extra[d.key] ?? '') !== '') extra[d.key] = form.extra[d.key];
      const row = {
        area: form.area, location_detail: form.location_detail.trim(), symptom: form.symptom.trim(), onset: form.onset,
        qty: form.qty_unknown ? null : Number(form.qty), unit: form.qty_unknown ? null : form.unit, qty_unknown: form.qty_unknown,
        work_when: form.work_when, high_place: form.high_place, extra, urgency: form.urgency, quarter: form.quarter,
      };
      if (isNew) {
        const { error } = await sb.from('items').insert({ id: itemId, submission_id: submissionId, store_id: storeId, category_id: cat.id, ...row });
        if (error && error.code !== '23505') throw error; // 23505: 재시도로 이미 저장된 경우
        if (error?.code === '23505') { const { error: ue } = await sb.from('items').update(row).eq('id', itemId); if (ue) throw ue; }
        const { error: ie } = await sb.from('inspections').upsert(
          { submission_id: submissionId, store_id: storeId, category_id: cat.id, result: 'needs_repair' }, { onConflict: 'submission_id,category_id' });
        if (ie) throw ie;
      } else {
        const { error } = await sb.from('items').update(row).eq('id', itemId);
        if (error) throw error;
      }
      // 사진 동기화
      const have = new Set(origPhotos.current.map((p) => p.dbId));
      const existing = isNew ? await sb.from('item_photos').select('id,path').eq('item_id', itemId) : null;
      const existingPaths = new Set((existing?.data ?? []).map((p: any) => p.path));
      const toInsert = form.photos.filter((p) => !p.dbId && !existingPaths.has(p.path));
      const toDelete = origPhotos.current.filter((o) => !form.photos.some((p) => p.dbId === o.dbId));
      if (toInsert.length) {
        const { error } = await sb.from('item_photos').insert(toInsert.map((p) => ({ item_id: itemId, store_id: storeId, kind: p.kind, path: p.path })));
        if (error) throw error;
      }
      if (toDelete.length && have.size) {
        const { error } = await sb.from('item_photos').delete().in('id', toDelete.map((p) => p.dbId!));
        if (error) throw error;
        void sb.storage.from('item-photos').remove(toDelete.map((p) => p.path));
      }
      clearDraft(draftKey);
      router.replace('/staff/inspect');
    } catch {
      toast('저장하지 못했습니다. 입력 내용은 보관되어 있으니 연결 확인 후 다시 저장하세요.', true);
      setBusy(false);
    }
  }

  async function removeItem() {
    if (!confirm('이 항목을 삭제할까요?')) return;
    const sb = supabase();
    const { data: ph } = await sb.from('item_photos').select('path').eq('item_id', itemId);
    const { error } = await sb.from('items').delete().eq('id', itemId);
    if (error) return toast('삭제하지 못했습니다 (작성중 항목만 삭제 가능)', true);
    if (ph?.length) void sb.storage.from('item-photos').remove(ph.map((p) => p.path));
    clearDraft(draftKey);
    router.replace('/staff/inspect');
  }

  const e = errors;
  const inputCls = (k: string) => `input ${e[k] ? 'input-err' : ''}`;
  const extraField = useMemo(() => (d: FieldDef) => d, []);

  if (!catId) return <Shell role="staff" title="항목 입력"><div className="card">분류를 먼저 선택하세요.</div></Shell>;
  if (loadErr) return <Shell role="staff" title="항목 입력"><div className="card text-red-600">{loadErr}</div></Shell>;
  if (!profile || !cat || !form) return <Spinner />;

  return (
    <Shell role="staff" title={`${cat.name} 입력`}>
      {node}
      <div className="mb-4">
        <div className="mb-1 flex justify-between text-sm font-semibold"><span>{step + 1}/4 {STEP_TITLE[step]}</span><span className="text-slate-400">자동 임시저장</span></div>
        <div className="h-1.5 rounded bg-slate-200"><div className="h-1.5 rounded bg-brand transition-all" style={{ width: `${((step + 1) / 4) * 100}%` }} /></div>
      </div>

      <div className="card pb-2">
        {step === 0 && (
          <>
            <Field label="구역" error={e.area}><Chips options={AREAS} value={form.area} onChange={(v) => set('area', v)} error={!!e.area} /></Field>
            <Field label="상세 위치 (한 줄)" error={e.location_detail}>
              <input className={inputCls('location_detail')} value={form.location_detail} onChange={(ev) => set('location_detail', ev.target.value)} placeholder="예: 정문 입구 오른쪽 천장" />
            </Field>
            <Field label="현황 (증상 한 줄)" error={e.symptom}>
              <input className={inputCls('symptom')} value={form.symptom} onChange={(ev) => set('symptom', ev.target.value)} placeholder="예: 천장에서 물이 떨어짐" />
            </Field>
            <Field label="발생 시기" error={e.onset}><Chips options={ONSETS} value={form.onset} onChange={(v) => set('onset', v)} error={!!e.onset} /></Field>
          </>
        )}

        {step === 1 && (
          <>
            <Field label="범위·수량" error={e.qty ?? e.unit}>
              <div className="flex gap-2">
                <input className={`${inputCls('qty')} flex-1`} inputMode="decimal" disabled={form.qty_unknown} value={form.qty}
                  onChange={(ev) => set('qty', ev.target.value.replace(/[^0-9.]/g, ''))} placeholder="숫자" />
              </div>
              <div className="mt-2"><Chips options={cat.units} value={form.unit} onChange={(v) => set('unit', v)} /></div>
              <button type="button" className={`chip mt-2 ${form.qty_unknown ? '!border-amber-500 !bg-amber-500 text-white' : ''}`}
                onClick={() => setForm({ ...form, qty_unknown: !form.qty_unknown, qty: '' })}>{UNKNOWN_LABEL}</button>
            </Field>
            {cat.required_fields.map((d) => {
              const f = extraField(d); const key = `extra.${d.key}`; const v = form.extra[d.key] ?? '';
              return (
                <Field key={d.key} label={`${d.label}${d.required ? '' : ' (선택)'}`} error={e[key]}>
                  {d.type === 'select' ? (
                    <Chips options={[...(d.options ?? []), ...(d.unknown ? [UNKNOWN] : [])]} value={v} onChange={(x) => setExtra(d.key, x)}
                      error={!!e[key]} labels={{ [UNKNOWN]: '모름' }} />
                  ) : (
                    <div className="flex items-center gap-2">
                      <input className={`${inputCls(key)} flex-1`} inputMode={d.type === 'number' ? 'decimal' : 'text'} disabled={v === UNKNOWN}
                        value={v === UNKNOWN ? '' : v} onChange={(ev) => setExtra(d.key, d.type === 'number' ? ev.target.value.replace(/[^0-9.]/g, '') : ev.target.value)} />
                      {f.unit && <span className="text-sm text-slate-500">{f.unit}</span>}
                      {d.unknown && <button type="button" className={`chip ${v === UNKNOWN ? 'chip-on' : ''}`} onClick={() => setExtra(d.key, v === UNKNOWN ? '' : UNKNOWN)}>모름</button>}
                    </div>
                  )}
                </Field>
              );
            })}
          </>
        )}

        {step === 2 && (
          <>
            <p className="mb-3 text-sm text-slate-600">업체가 현장 방문 없이 볼 수 있도록 3종을 권장합니다. <b>최소 2장</b> 필요합니다.</p>
            {e.photos && <p className="err mb-3">{e.photos}</p>}
            <div className="space-y-3 pb-2">
              {KINDS.map((k) => {
                const p = form.photos.find((x) => x.kind === k);
                return (
                  <div key={k} className="rounded-2xl border border-slate-200 p-3">
                    <div className="mb-2 font-semibold">{PHOTO_KIND_LABEL[k]} <span className="text-xs font-normal text-slate-500">· {GUIDE[k]}</span></div>
                    {p && <PhotoImg path={p.path} className="mb-2 h-44 w-full rounded-xl" />}
                    {upState[k] === 'uploading' && <p className="mb-2 text-sm text-slate-500">업로드 중…</p>}
                    {upState[k] === 'error' && (
                      <p className="mb-2 text-sm text-red-600">업로드 실패{' '}
                        {failedFiles.current[k] && <button className="font-bold underline" onClick={() => addPhoto(k, failedFiles.current[k]!)}>재시도</button>}</p>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <PickBtn label="📷 촬영" capture onFile={(f) => addPhoto(k, f)} />
                      <PickBtn label="🖼 앨범" onFile={(f) => addPhoto(k, f)} />
                      {p ? <button className="chip" onClick={() => removePhoto(k)}>삭제</button> : <span />}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <Field label="영업 중 작업" error={e.work_when}>
              <Chips options={['anytime', 'night', 'holiday'] as const} labels={WORK_WHEN} value={form.work_when} onChange={(v) => set('work_when', v)} error={!!e.work_when} />
            </Field>
            <Field label="고소·사다리 작업" error={e.high_place}>
              <Chips options={['yes', 'no', 'unknown'] as const} labels={HIGH_PLACE} value={form.high_place} onChange={(v) => set('high_place', v)} error={!!e.high_place} />
            </Field>
            <Field label="긴급도 (분류 기본값에서 변경 가능)">
              <Chips options={['urgent', 'normal', 'low'] as Urgency[]} labels={URGENCY_LABEL} value={form.urgency} onChange={(v) => set('urgency', v)} />
            </Field>
            <Field label="희망 시기" error={e.quarter}>
              <Chips options={QUARTERS} labels={QUARTER_LABEL} value={form.quarter} onChange={(v) => set('quarter', v)} error={!!e.quarter} />
            </Field>
          </>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl gap-2">
          {step > 0 ? <button className="btn-outline flex-1" onClick={() => { setStep(step - 1); window.scrollTo(0, 0); }}>이전</button>
            : <button className="btn-outline flex-1" onClick={() => router.back()}>취소</button>}
          {step < 3 ? <button className="btn-primary flex-[2]" onClick={next}>다음</button>
            : <button className="btn-primary flex-[2]" disabled={busy || Object.keys(upState).length > 0} onClick={save}>{busy ? '저장 중…' : '저장'}</button>}
        </div>
        {!isNew && <button className="mt-1 w-full text-center text-xs text-red-600" onClick={removeItem}>이 항목 삭제 (작성중인 항목만)</button>}
      </div>
      <div className="h-24" />
    </Shell>
  );
}

function mergeDbIds(photos: PhotoRef[], orig: PhotoRef[]): PhotoRef[] {
  return photos.map((p) => ({ ...p, dbId: orig.find((o) => o.path === p.path)?.dbId }));
}

function PickBtn({ label, capture, onFile }: { label: string; capture?: boolean; onFile: (f: File) => void }) {
  return (
    <label className="chip cursor-pointer">
      {label}
      <input type="file" accept="image/*" capture={capture ? 'environment' : undefined} className="hidden"
        onChange={(ev) => { const f = ev.target.files?.[0]; if (f) onFile(f); ev.target.value = ''; }} />
    </label>
  );
}
