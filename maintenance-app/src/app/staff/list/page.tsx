'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useGuard } from '@/lib/auth';
import { useStaffData } from '@/lib/staffData';
import { supabase } from '@/lib/supabase';
import { QUARTERS, QUARTER_LABEL, URGENCY_ORDER } from '@/lib/constants';
import { Shell, Spinner, StatusBadge, UrgencyBadge, useToast } from '@/components/ui';

interface SubmitError { category: string; msg: string; item_id?: string }

export default function MyList() {
  const profile = useGuard('staff');
  const { data, error, reload } = useStaffData(profile);
  const { toast, node } = useToast();
  const [errs, setErrs] = useState<SubmitError[]>([]);
  const [busy, setBusy] = useState(false);
  if (!profile) return <Spinner />;

  async function submit() {
    if (!data) return;
    if (!confirm('지점 리스트를 제출할까요? 제출 후에는 반려된 항목만 수정할 수 있습니다.')) return;
    setBusy(true);
    const { data: r, error: e } = await supabase().rpc('submit_submission', { p_submission: data.submission.id });
    setBusy(false);
    if (e) return toast('제출하지 못했습니다. 연결을 확인하세요.', true);
    if (!r.ok) { setErrs(r.errors); return toast('빈 칸이 있어 제출할 수 없습니다', true); }
    setErrs([]); toast(`제출 완료 (${r.count}건)`); await reload();
  }

  const pending = data?.items.filter((i) => i.status === 'draft' || i.status === 'rejected').length ?? 0;
  const catName = (id: string) => data?.categories.find((c) => c.id === id)?.name ?? '';

  return (
    <Shell role="staff" title="내 리스트">
      {node}
      {error && <div className="card mb-3 text-sm text-red-600">{error} <button className="underline" onClick={reload}>다시 시도</button></div>}
      {!data ? <Spinner /> : (
        <>
          <p className="mb-3 text-sm text-slate-500">{data.store.name} · {data.submission.year}년 · 희망 시기별</p>
          {errs.length > 0 && (
            <div className="mb-3 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
              <b>제출 전에 확인하세요</b>
              <ul className="mt-1 space-y-0.5">{errs.map((e, k) => (
                <li key={k}>· {e.category}: {e.msg} {e.item_id && <Link className="underline" href={`/staff/item?id=${e.item_id}&category=${data.categories.find((c) => c.name === e.category)?.id}`}>수정</Link>}</li>
              ))}</ul>
            </div>
          )}
          {QUARTERS.map((q) => {
            const list = data.items.filter((i) => i.quarter === q).sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] || a.created_at.localeCompare(b.created_at));
            if (!list.length) return null;
            return (
              <section key={q} className="mb-4">
                <h2 className="mb-2 font-bold">{QUARTER_LABEL[q]} <span className="text-slate-400">({list.length})</span></h2>
                <div className="space-y-2">
                  {list.map((i) => {
                    const editable = i.status === 'draft' || i.status === 'rejected';
                    const body = (
                      <div className="card">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="font-bold">{catName(i.category_id)}</span>
                          <span className="flex gap-1.5"><UrgencyBadge urgency={i.urgency} /><StatusBadge status={i.status} /></span>
                        </div>
                        <p className="text-sm text-slate-600">{i.area} · {i.location_detail}</p>
                        <p className="text-sm text-slate-500">{i.symptom}{i.needs_survey && <b className="ml-1 text-amber-600">· 실사 필요</b>}</p>
                        {i.status === 'rejected' && <p className="mt-1.5 rounded-lg bg-red-50 p-2 text-sm text-red-700">반려: {i.reject_reason ?? '수정 필요'}{i.reject_missing?.length ? ` — 보완: ${i.reject_missing.join(', ')}` : ''}</p>}
                        {i.status === 'held' && i.reject_reason && <p className="mt-1.5 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">보류: {i.reject_reason}</p>}
                      </div>
                    );
                    return editable ? <Link key={i.id} href={`/staff/item?id=${i.id}&category=${i.category_id}`} className="block">{body}</Link> : <div key={i.id}>{body}</div>;
                  })}
                </div>
              </section>
            );
          })}
          {!data.items.length && <div className="card text-center text-slate-500">등록된 항목이 없습니다. 점검 탭에서 시작하세요.</div>}
          {(data.submission.status === 'draft' || pending > 0) && (
            <button className="btn-primary mt-2 w-full" disabled={busy} onClick={submit}>
              {busy ? '제출 중…' : data.submission.status === 'draft' ? `지점 리스트 제출 (항목 ${pending}건)` : `반려 항목 재제출 (${pending}건)`}
            </button>
          )}
        </>
      )}
    </Shell>
  );
}
