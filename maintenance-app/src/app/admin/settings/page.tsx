'use client';
import { useState } from 'react';
import { useGuard } from '@/lib/auth';
import { useAdminData } from '@/lib/adminData';
import { supabase } from '@/lib/supabase';
import { URGENCY_LABEL } from '@/lib/constants';
import { Shell, Spinner, useToast } from '@/components/ui';
import type { Category, Urgency } from '@/lib/types';

export default function SettingsPage() {
  const profile = useGuard('admin');
  const { data, error, reload } = useAdminData(!!profile);
  const { toast, node } = useToast();
  const [name, setName] = useState('');
  const [units, setUnits] = useState('개,장,m,㎡,개소');
  if (!profile) return <Spinner />;
  const canEdit = profile.region_id === null; // 분류는 전체 관리자만 수정

  async function patch(c: Category, values: Partial<Category>) {
    const { error, count } = await supabase().from('categories').update(values, { count: 'exact' }).eq('id', c.id);
    if (error || count === 0) return toast('수정하지 못했습니다 (전체 관리자만 가능)', true);
    await reload();
  }
  async function add() {
    if (!name.trim()) return toast('분류 이름을 입력하세요', true);
    const list = units.split(',').map((u) => u.trim()).filter(Boolean);
    const sort = Math.max(0, ...(data?.categories.filter((c) => c.sort < 90).map((c) => c.sort) ?? [0])) + 1;
    const { error } = await supabase().from('categories').insert({
      name: name.trim(), units: list.length ? list : ['개'], sort,
      required_fields: [{ key: 'target', label: '보수 대상', type: 'text', required: true }],
    });
    if (error) return toast('추가하지 못했습니다: ' + error.message, true);
    setName(''); toast('분류를 추가했습니다. 모든 지점의 점검 목록에 바로 나타납니다.'); await reload();
  }

  return (
    <Shell role="admin" title="분류 설정" wide>
      {node}
      {error && <div className="card mb-3 text-sm text-red-600">{error}</div>}
      {!canEdit && <div className="card mb-3 text-sm text-slate-600">지역 관리자는 분류를 볼 수만 있습니다.</div>}
      {!data ? <Spinner /> : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {data.categories.map((c) => (
              <div key={c.id} className={`card ${c.active ? '' : 'opacity-50'}`}>
                <div className="mb-2 flex items-center justify-between">
                  <b>{c.name}</b>
                  <button disabled={!canEdit} className="px-2 text-xs font-semibold text-slate-500 underline" onClick={() => patch(c, { active: !c.active })}>{c.active ? '사용 중지' : '다시 사용'}</button>
                </div>
                <label className="mb-2 flex items-center justify-between text-sm">기본 긴급도
                  <select disabled={!canEdit} className="input !w-auto" value={c.default_urgency} onChange={(e) => patch(c, { default_urgency: e.target.value as Urgency })}>
                    {(['urgent', 'normal', 'low'] as Urgency[]).map((u) => <option key={u} value={u}>{URGENCY_LABEL[u]}</option>)}
                  </select>
                </label>
                <div className="text-xs font-semibold text-slate-500">필수 입력 항목 (공통 항목은 항상 필수)</div>
                <ul className="mt-1 space-y-0.5">
                  {c.required_fields.map((f) => (
                    <li key={f.key}>
                      <label className="flex min-h-[40px] items-center justify-between text-sm">
                        <span>{f.label}{f.unknown && <span className="ml-1 text-xs text-slate-400">(모름 허용)</span>}</span>
                        <input type="checkbox" className="h-5 w-5 accent-[#1428A0]" disabled={!canEdit} checked={f.required}
                          onChange={() => patch(c, { required_fields: c.required_fields.map((x) => (x.key === f.key ? { ...x, required: !x.required } : x)) })} />
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {canEdit && (
            <div className="card mt-4">
              <b className="mb-2 block">분류 추가</b>
              <div className="flex flex-wrap gap-2">
                <input className="input !w-auto flex-1" placeholder="분류 이름" value={name} onChange={(e) => setName(e.target.value)} />
                <input className="input !w-auto flex-1" placeholder="단위(쉼표 구분)" value={units} onChange={(e) => setUnits(e.target.value)} />
                <button className="btn-primary" onClick={add}>추가</button>
              </div>
              <p className="mt-2 text-xs text-slate-500">새 분류는 &quot;보수 대상&quot; 한 항목만 필수로 시작합니다. 항목 편집은 Phase 1.5에서 추가됩니다.</p>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
