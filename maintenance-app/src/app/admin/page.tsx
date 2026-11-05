'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGuard } from '@/lib/auth';
import { useAdminData } from '@/lib/adminData';
import { QUARTERS, QUARTER_LABEL } from '@/lib/constants';
import { BarChart, Shell, Spinner, Stat } from '@/components/ui';

export default function AdminHome() {
  const profile = useGuard('admin');
  const { data, error, reload } = useAdminData(!!profile);
  const router = useRouter();
  if (!profile) return <Spinner />;
  return (
    <Shell role="admin" title="관리자" wide>
      {error && <div className="card mb-3 text-sm text-red-600">{error} <button className="underline" onClick={reload}>다시 시도</button></div>}
      {!data ? <Spinner /> : (() => {
        const sent = data.items.filter((i) => i.status !== 'draft');
        const waiting = data.items.filter((i) => i.status === 'submitted');
        const survey = waiting.filter((i) => i.needs_survey);
        const subOf = (id: string) => data.submissions.find((s) => s.store_id === id);
        const activeStores = data.stores.filter((s) => s.active);
        const notSubmitted = activeStores.filter((s) => subOf(s.id)?.status !== 'submitted');
        const byCat = data.categories.map((c) => ({ label: c.name, value: sent.filter((i) => i.category_id === c.id).length })).filter((d) => d.value > 0);
        const byQ = QUARTERS.map((q) => ({ label: QUARTER_LABEL[q], value: sent.filter((i) => i.quarter === q).length })).filter((d) => d.value > 0);
        return (
          <>
            <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="승인 대기" value={waiting.length} tone="alert" href="/admin/approvals?status=submitted" />
              <Stat label="실사 필요(대기 중)" value={survey.length} href="/admin/approvals?status=submitted&survey=1" />
              <Stat label="보류" value={data.items.filter((i) => i.status === 'held').length} href="/admin/approvals?status=held" />
              <Stat label="승인 완료" value={data.items.filter((i) => i.status === 'approved').length} tone="ok" href="/admin/approvals?status=approved" />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="card">
                <div className="mb-2 flex items-center justify-between">
                  <b>지점별 제출 현황</b>
                  <span className={`text-sm font-bold ${notSubmitted.length ? 'text-red-600' : 'text-emerald-600'}`}>미제출 {notSubmitted.length} / {activeStores.length}</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {[...activeStores].sort((a, b) => Number(subOf(a.id)?.status === 'submitted') - Number(subOf(b.id)?.status === 'submitted')).map((s) => {
                    const sub = subOf(s.id);
                    const done = sub?.status === 'submitted';
                    const n = data.items.filter((i) => i.store_id === s.id && i.status !== 'draft').length;
                    return (
                      <li key={s.id}>
                        <button className="flex min-h-[44px] w-full items-center justify-between text-left text-sm"
                          onClick={() => router.push(`/admin/approvals?store=${s.id}&status=all`)}>
                          <span className={done ? '' : 'font-bold text-red-600'}>{s.name}</span>
                          <span className={done ? 'text-slate-600' : 'font-bold text-red-600'}>{done ? `제출 · ${n}건` : sub ? '작성중' : '미착수'}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="space-y-3">
                <div className="card">
                  <b className="mb-2 block">분류별 건수</b>
                  {byCat.length ? <BarChart data={byCat} onClick={(label) => { const c = data.categories.find((x) => x.name === label); router.push(`/admin/approvals?status=all&category=${c?.id}`); }} /> : <p className="text-sm text-slate-500">제출된 항목이 없습니다.</p>}
                </div>
                <div className="card">
                  <b className="mb-2 block">분기별 건수</b>
                  {byQ.length ? <BarChart data={byQ} /> : <p className="text-sm text-slate-500">제출된 항목이 없습니다.</p>}
                </div>
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-slate-400">
              <Link href="/admin/approvals?status=submitted" className="underline">승인 대기 목록으로</Link>
            </p>
          </>
        );
      })()}
    </Shell>
  );
}
