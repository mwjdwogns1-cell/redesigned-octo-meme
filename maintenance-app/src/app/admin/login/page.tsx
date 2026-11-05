'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Field, SetupNotice } from '@/components/ui';

export default function AdminLogin() {
  const { configured, refresh } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!configured) return <SetupNotice />;

  async function login() {
    setBusy(true); setErr('');
    const { error } = await supabase().auth.signInWithPassword({ email, password: pw });
    if (error) { setBusy(false); return setErr('이메일 또는 비밀번호가 올바르지 않습니다.'); }
    const p = await refresh();
    if (p?.role !== 'admin' || p.status !== 'active') {
      await supabase().auth.signOut(); await refresh(); setBusy(false);
      return setErr('관리자 권한이 없는 계정입니다.');
    }
    router.replace('/admin');
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-10">
      <h1 className="mb-6 text-2xl font-extrabold">관리자 로그인</h1>
      <form className="card" onSubmit={(e) => { e.preventDefault(); void login(); }}>
        <Field label="이메일"><input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="비밀번호"><input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        {err && <p className="err mb-3">{err}</p>}
        <button className="btn-primary w-full" disabled={busy || !email || !pw}>{busy ? '확인 중…' : '로그인'}</button>
      </form>
      <p className="mt-6 text-center text-sm"><Link href="/start" className="text-slate-500 underline">직원 화면으로</Link></p>
    </div>
  );
}
