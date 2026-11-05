'use client';
import Link from 'next/link';
import { useGuard } from '@/lib/auth';
import { useStaffData } from '@/lib/staffData';
import { QUARTERS, QUARTER_LABEL, STATUS_LABEL } from '@/lib/constants';
import { Shell, Spinner, Stat } from '@/components/ui';
import type { ItemStatus } from '@/lib/types';

export default function StaffHome() {
  const profile = useGuard('staff');
  const { data, error, reload } = useStaffData(profile);
  if (!profile) return <Spinner />;
  return (
    <Shell role="staff" title="우리 매장">
      {error && <div className="card mb-3 text-sm text-red-600">{error} <button className="underline" onClick={reload}>다시 시도</button></div>}
      {!data ? <Spinner /> : <Body data={data} />}
    </Shell>
  );
}

function Body({ data }: { data: NonNullable<ReturnType<typeof useStaffData>['data']> }) {
  const { store, submission, categories, inspections, items } = data;
  const count = (s: ItemStatus) => items.filter((i) => i.status === s).length;
  const rejected = items.filter((i) => i.status === 'rejected');
  const urgentOpen = items.filter((i) => i.urgency === 'urgent' && i.status !== 'approved');
  const done = inspections.length;
  return (
    <>
      <p className="mb-3 text-sm text-slate-500">{store.name} · {submission.year}년 계획</p>

      {rejected.length > 0 && (
        <Link href="/staff/list" className="mb-3 block rounded-2xl border border-red-300 bg-red-50 p-4">
          <div className="font-extrabold text-red-700">반려·보완 필요 {rejected.length}건</div>
          <ul className="mt-1 space-y-0.5 text-sm text-red-700">
            {rejected.slice(0, 3).map((i) => <li key={i.id}>· {i.location_detail} — {i.reject_reason ?? '수정 필요'}{i.reject_missing?.length ? ` (${i.reject_missing.join(', ')})` : ''}</li>)}
          </ul>
        </Link>
      )}

      <div className="card mb-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-slate-500">점검 진행</div>
            <div className="text-2xl font-extrabold">{done} / {categories.length}</div>
          </div>
          {submission.status === 'draft'
            ? <Link href="/staff/inspect" className="btn-primary">{done ? '이어서 점검' : '점검 시작'}</Link>
            : <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">제출 완료</span>}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(['draft', 'submitted', 'approved', 'held', 'rejected'] as ItemStatus[]).map((s) => (
          <Stat key={s} label={STATUS_LABEL[s]} value={count(s)} tone={s === 'rejected' ? 'alert' : 'default'} href="/staff/list" />
        ))}
      </div>

      {urgentOpen.length > 0 && (
        <div className="card mb-3">
          <div className="mb-1 font-bold text-red-600">긴급 미처리 {urgentOpen.length}건</div>
          <ul className="space-y-1 text-sm">{urgentOpen.map((i) => <li key={i.id}>· {i.location_detail} <span className="text-slate-400">({STATUS_LABEL[i.status]})</span></li>)}</ul>
        </div>
      )}

      <div className="card">
        <div className="mb-2 font-bold">분기별 예정</div>
        <ul className="divide-y divide-slate-100 text-sm">
          {QUARTERS.map((q) => <li key={q} className="flex justify-between py-2"><span>{QUARTER_LABEL[q]}</span><b>{items.filter((i) => i.quarter === q).length}건</b></li>)}
        </ul>
      </div>
    </>
  );
}
