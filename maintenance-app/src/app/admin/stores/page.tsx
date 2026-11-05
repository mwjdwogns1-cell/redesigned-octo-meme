'use client';
import { useState } from 'react';
import { useGuard } from '@/lib/auth';
import { useAdminData } from '@/lib/adminData';
import { supabase } from '@/lib/supabase';
import { Shell, Spinner, useToast } from '@/components/ui';

export default function StoresPage() {
  const profile = useGuard('admin');
  const { data, error, reload } = useAdminData(!!profile);
  const { toast, node } = useToast();
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  if (!profile) return <Spinner />;

  async function addStore() {
    const rid = region || data?.regions[0]?.id;
    if (!name.trim() || !rid) return toast('지역과 지점명을 입력하세요', true);
    const { error } = await supabase().from('stores').insert({ name: name.trim(), region_id: rid });
    if (error) return toast('추가하지 못했습니다: ' + error.message, true);
    setName(''); toast('지점을 추가했습니다'); await reload();
  }
  async function setStatus(uid: string, status: 'active' | 'inactive') {
    const { error } = await supabase().rpc('admin_set_user_status', { p_uid: uid, p_status: status });
    if (error) return toast('처리하지 못했습니다: ' + error.message, true);
    await reload();
  }

  return (
    <Shell role="admin" title="지점·계정" wide>
      {node}
      {error && <div className="card mb-3 text-sm text-red-600">{error}</div>}
      {!data ? <Spinner /> : (
        <>
          <div className="card mb-4">
            <b className="mb-2 block">지점 추가</b>
            <div className="flex flex-wrap gap-2">
              <select className="input !w-auto" value={region} onChange={(e) => setRegion(e.target.value)}>
                {data.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <input className="input !w-auto flex-1" placeholder="지점명" value={name} onChange={(e) => setName(e.target.value)} />
              <button className="btn-primary" onClick={addStore}>추가</button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {data.stores.map((s) => {
              const people = data.staff.filter((p) => p.store_id === s.id);
              return (
                <div key={s.id} className="card">
                  <div className="mb-2 flex items-center justify-between">
                    <b>{s.name}</b><span className="text-xs text-slate-400">{data.regions.find((r) => r.id === s.region_id)?.name}</span>
                  </div>
                  {people.length === 0 && <p className="text-sm text-slate-500">아직 사용한 담당자가 없습니다.</p>}
                  <ul className="divide-y divide-slate-100">
                    {people.map((p) => (
                      <li key={p.id} className="flex min-h-[44px] items-center justify-between text-sm">
                        <span className={p.status === 'inactive' ? 'text-slate-400 line-through' : ''}>{p.name}{p.phone && <span className="ml-2 text-slate-400">{p.phone}</span>}</span>
                        <button className="px-2 text-xs font-semibold text-slate-500 underline" onClick={() => setStatus(p.id, p.status === 'active' ? 'inactive' : 'active')}>
                          {p.status === 'active' ? '비활성화' : '다시 활성화'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Shell>
  );
}
