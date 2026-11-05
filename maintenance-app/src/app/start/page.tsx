'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Field, SetupNotice, Spinner, useToast } from '@/components/ui';
import type { Region, Store } from '@/lib/types';

/** 직원 시작 화면: 매장을 고르고 이름만 입력하면 바로 사용 (누가 입력했는지만 기록) */
export default function Start() {
  const { loading, profile, configured, refresh } = useAuth();
  const router = useRouter();
  const [regions, setRegions] = useState<Region[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [regionId, setRegionId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { toast, node } = useToast();

  useEffect(() => {
    if (loading || !configured) return;
    if (profile?.status === 'active') { router.replace(profile.role === 'admin' ? '/admin' : '/staff'); return; }
    (async () => {
      try {
        const sb = supabase();
        const { data: s } = await sb.auth.getSession();
        if (!s.session) {
          const { error } = await sb.auth.signInAnonymously();
          if (error) throw new Error('익명 로그인을 사용할 수 없습니다. Supabase 설정에서 Anonymous sign-ins를 켜 주세요.');
        }
        const [r, st] = await Promise.all([
          sb.from('regions').select('*').order('name'),
          sb.from('stores').select('*').eq('active', true).order('name'),
        ]);
        if (r.error || st.error) throw new Error('매장 목록을 불러오지 못했습니다. 네트워크를 확인하세요.');
        setRegions(r.data as Region[]); setStores(st.data as Store[]);
        if ((r.data?.length ?? 0) === 1) setRegionId(r.data![0].id);
      } catch (e: any) { setErr(e.message); }
    })();
  }, [loading, profile, configured, router]);

  if (!configured) return <SetupNotice />;
  if (loading) return <Spinner />;

  const shown = stores.filter((s) => !regionId || s.region_id === regionId);

  async function join() {
    if (!storeId) return toast('매장을 선택하세요', true);
    if (!name.trim()) return toast('이름을 입력하세요', true);
    setBusy(true);
    const { error } = await supabase().rpc('join_store', { p_store: storeId, p_name: name, p_phone: phone || null });
    if (error) { setBusy(false); return toast('시작하지 못했습니다: ' + error.message, true); }
    await refresh();
    router.replace('/staff');
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      {node}
      <h1 className="text-2xl font-extrabold">매장 유지보수</h1>
      <p className="mb-6 mt-1 text-slate-500">매장을 선택하고 이름을 입력하면 바로 시작합니다.</p>
      {err && <p className="err mb-4">{err}</p>}
      {profile?.status === 'inactive' && <p className="err mb-4">이 계정은 비활성화되었습니다. 관리자에게 문의하세요.</p>}
      <div className="card">
        {regions.length > 1 && (
          <Field label="지역">
            <select className="input" value={regionId} onChange={(e) => { setRegionId(e.target.value); setStoreId(''); }}>
              <option value="">전체</option>
              {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="매장">
          <div className="grid gap-2">
            {shown.map((s) => (
              <button key={s.id} type="button" onClick={() => setStoreId(s.id)} className={`chip justify-start ${storeId === s.id ? 'chip-on' : ''}`}>{s.name}</button>
            ))}
            {!shown.length && !err && <p className="text-sm text-slate-500">등록된 매장이 없습니다.</p>}
          </div>
        </Field>
        <Field label="이름 (누가 입력했는지 기록됩니다)">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <Field label="연락처 (선택)">
          <input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <p className="mb-3 text-xs text-slate-500">입력한 이름·연락처는 담당자 확인 용도로만 사용됩니다.</p>
        <button className="btn-primary w-full" disabled={busy} onClick={join}>{busy ? '시작하는 중…' : '시작하기'}</button>
      </div>
      <p className="mt-6 text-center text-sm"><Link href="/admin/login" className="text-slate-500 underline">관리자 로그인</Link></p>
    </div>
  );
}
