'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useGuard } from '@/lib/auth';
import { useStaffData } from '@/lib/staffData';
import { supabase } from '@/lib/supabase';
import { Shell, Spinner, StatusBadge, UrgencyBadge, useToast } from '@/components/ui';
import type { Category } from '@/lib/types';

export default function Inspect() {
  const profile = useGuard('staff');
  const { data, error, reload } = useStaffData(profile);
  const { toast, node } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (!profile) return <Spinner />;

  async function setResult(cat: Category, result: 'ok' | 'needs_repair') {
    if (!data) return;
    const mine = data.items.filter((i) => i.category_id === cat.id);
    if (result === 'ok' && mine.length) {
      if (!confirm(`'${cat.name}'에 등록한 항목 ${mine.length}건이 삭제됩니다. 양호로 바꿀까요?`)) return;
    }
    setBusy(cat.id);
    try {
      const sb = supabase();
      if (result === 'ok' && mine.length) {
        const { data: ph } = await sb.from('item_photos').select('path').in('item_id', mine.map((i) => i.id));
        const { error: de } = await sb.from('items').delete().in('id', mine.map((i) => i.id));
        if (de) throw de;
        if (ph?.length) void sb.storage.from('item-photos').remove(ph.map((p) => p.path));
      }
      const { error: e } = await sb.from('inspections').upsert(
        { submission_id: data.submission.id, store_id: data.store.id, category_id: cat.id, result },
        { onConflict: 'submission_id,category_id' });
      if (e) throw e;
      await reload();
    } catch (e: any) { toast('저장하지 못했습니다. 연결을 확인하고 다시 눌러 주세요.', true); }
    setBusy(null);
  }

  return (
    <Shell role="staff" title="현황 점검">
      {node}
      {error && <div className="card mb-3 text-sm text-red-600">{error} <button className="underline" onClick={reload}>다시 시도</button></div>}
      {!data ? <Spinner /> : (
        <>
          <div className="mb-3 flex items-center justify-between text-sm text-slate-600">
            <span>{data.store.name} · 점검 {data.inspections.length}/{data.categories.length}</span>
            <Link href="/staff/list" className="font-semibold text-brand">내 리스트 →</Link>
          </div>
          {data.submission.status === 'submitted' && (
            <div className="card mb-3 text-sm text-slate-600">이미 제출했습니다. 반려된 항목만 &quot;내 리스트&quot;에서 수정할 수 있습니다.</div>
          )}
          <div className="space-y-3">
            {data.categories.map((c) => {
              const res = data.inspections.find((i) => i.category_id === c.id)?.result;
              const mine = data.items.filter((i) => i.category_id === c.id);
              const locked = data.submission.status !== 'draft';
              return (
                <div key={c.id} className="card">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-bold">{c.name}</span>
                    <UrgencyBadge urgency={c.default_urgency} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button disabled={locked || busy === c.id} onClick={() => setResult(c, 'ok')} className={`chip ${res === 'ok' ? 'chip-on' : ''}`}>양호</button>
                    <button disabled={locked || busy === c.id} onClick={() => setResult(c, 'needs_repair')}
                      className={`chip ${res === 'needs_repair' ? '!border-red-600 !bg-red-600 text-white' : ''}`}>보수필요</button>
                  </div>
                  {res === 'needs_repair' && (
                    <div className="mt-3 space-y-2">
                      {mine.map((i) => (
                        <Link key={i.id} href={`/staff/item?id=${i.id}&category=${c.id}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
                          <span className="truncate">{i.area} · {i.location_detail}{i.needs_survey && <b className="ml-1 text-amber-600">실사 필요</b>}</span>
                          <StatusBadge status={i.status} />
                        </Link>
                      ))}
                      {!locked && <Link href={`/staff/item?category=${c.id}`} className="btn-outline w-full">+ 보수 항목 추가</Link>}
                      {!mine.length && <p className="err">보수 항목을 1건 이상 등록하세요</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Shell>
  );
}
