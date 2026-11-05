'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { STATUS_LABEL, STATUS_STYLE, URGENCY_LABEL } from '@/lib/constants';
import type { ItemStatus, Urgency } from '@/lib/types';

export function Spinner({ label = '불러오는 중…' }: { label?: string }) {
  return <div className="p-10 text-center text-slate-500">{label}</div>;
}

export function StatusBadge({ status }: { status: ItemStatus }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  const s = urgency === 'urgent' ? 'bg-red-100 text-red-700' : urgency === 'normal' ? 'bg-slate-100 text-slate-700' : 'bg-sky-100 text-sky-700';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${s}`}>{URGENCY_LABEL[urgency]}</span>;
}

/** 단일 선택 큰 버튼 */
export function Chips<T extends string>({ options, value, onChange, error, labels }: {
  options: T[]; value: T | ''; onChange: (v: T) => void; error?: boolean; labels?: Record<string, string>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)}
          className={`chip ${value === o ? 'chip-on' : ''} ${error && !value ? 'chip-err' : ''}`}>
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <span className="lbl">{label}</span>
      {children}
      {error && <p className="err">{error}</p>}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="min-h-[44px] min-w-[44px] text-2xl text-slate-500" onClick={onClose} aria-label="닫기">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t); } }, [msg]);
  const node = msg ? (
    <div className={`fixed left-1/2 top-4 z-[60] w-[calc(100%-32px)] max-w-md -translate-x-1/2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${msg.error ? 'bg-red-600' : 'bg-slate-900'}`}>{msg.text}</div>
  ) : null;
  return { toast: (text: string, error = false) => setMsg({ text, error }), node };
}

/** 앱 공통 틀: 상단 제목 + 하단 탭. 폴드 펼침 등 넓은 화면에서는 가운데 정렬. */
export function Shell({ role, title, children, wide = false }: { role: 'staff' | 'admin'; title: string; children: ReactNode; wide?: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const tabs = role === 'staff'
    ? [{ href: '/staff', label: '홈', icon: '🏠' }, { href: '/staff/inspect', label: '점검', icon: '📝' }, { href: '/staff/list', label: '내 리스트', icon: '📋' }]
    : [{ href: '/admin', label: '홈', icon: '🏠' }, { href: '/admin/approvals', label: '승인', icon: '✅' }, { href: '/admin/stores', label: '지점·계정', icon: '🏬' }, { href: '/admin/settings', label: '설정', icon: '⚙️' }];
  const active = (h: string) => (h === '/staff' || h === '/admin' ? path === h : path.startsWith(h));
  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className={`mx-auto flex h-14 items-center justify-between px-4 ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>
          <h1 className="text-[17px] font-extrabold">{title}</h1>
          <button className="min-h-[44px] px-2 text-sm text-slate-500"
            onClick={async () => { await signOut(); router.replace(role === 'admin' ? '/admin/login' : '/start'); }}>
            {profile?.name} · 나가기
          </button>
        </div>
      </header>
      <main className={`mx-auto px-4 py-4 ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className={`mx-auto grid ${wide ? 'max-w-6xl' : 'max-w-3xl'}`} style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
          {tabs.map((t) => (
            <Link key={t.href} href={t.href}
              className={`flex min-h-[56px] flex-col items-center justify-center text-xs font-semibold ${active(t.href) ? 'text-brand' : 'text-slate-500'}`}>
              <span className="text-xl leading-none">{t.icon}</span>{t.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

/** 가로 막대 차트(CSS) — 라이브러리 없음 */
export function BarChart({ data, onClick }: { data: { label: string; value: number }[]; onClick?: (label: string) => void }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <button key={d.label} type="button" disabled={!onClick} onClick={() => onClick?.(d.label)} className="flex w-full items-center gap-2 text-left">
          <span className="w-24 shrink-0 truncate text-sm text-slate-600">{d.label}</span>
          <span className="h-5 flex-1 rounded bg-slate-100">
            <span className="block h-5 rounded bg-brand" style={{ width: `${(d.value / max) * 100}%`, minWidth: d.value ? 4 : 0 }} />
          </span>
          <span className="w-8 shrink-0 text-right text-sm font-bold">{d.value}</span>
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, href, tone = 'default' }: { label: string; value: number | string; href?: string; tone?: 'default' | 'alert' | 'ok' }) {
  const color = tone === 'alert' && Number(value) > 0 ? 'text-red-600' : tone === 'ok' ? 'text-emerald-600' : 'text-slate-900';
  const body = (
    <div className="card h-full">
      <div className="text-[13px] font-semibold text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-extrabold ${color}`}>{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function SetupNotice() {
  return (
    <div className="mx-auto max-w-md p-6">
      <div className="card">
        <h1 className="mb-2 text-lg font-bold">설정이 필요합니다</h1>
        <p className="text-sm text-slate-600">
          <code>.env.local</code>에 <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>를 넣고 다시 실행하세요. 자세한 순서는 README를 참고하세요.
        </p>
      </div>
    </div>
  );
}
