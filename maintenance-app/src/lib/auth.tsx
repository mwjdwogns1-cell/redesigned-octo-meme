'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { isConfigured, supabase } from './supabase';
import type { Profile } from './types';

interface AuthState {
  loading: boolean;
  profile: Profile | null;
  configured: boolean;
  refresh: () => Promise<Profile | null>;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const configured = isConfigured();

  const refresh = useCallback(async () => {
    if (!isConfigured()) { setLoading(false); return null; }
    const { data: s } = await supabase().auth.getSession();
    let p: Profile | null = null;
    if (s.session) {
      const { data } = await supabase().from('profiles').select('*').eq('id', s.session.user.id).maybeSingle();
      p = (data as Profile | null) ?? null;
    }
    setProfile(p);
    setLoading(false);
    return p;
  }, []);

  const signOut = useCallback(async () => {
    await supabase().auth.signOut();
    setProfile(null);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return <Ctx.Provider value={{ loading, profile, configured, refresh, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider 필요');
  return v;
};

/** 역할별 접근 보호: 로그인 안 했거나 역할이 다르면 알맞은 곳으로 보낸다 */
export function useGuard(role: 'staff' | 'admin') {
  const { loading, profile } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!profile || profile.status !== 'active') router.replace(role === 'admin' ? '/admin/login' : '/start');
    else if (profile.role !== role) router.replace(profile.role === 'admin' ? '/admin' : '/staff');
  }, [loading, profile, role, router]);
  return loading || !profile || profile.role !== role || profile.status !== 'active' ? null : profile;
}
