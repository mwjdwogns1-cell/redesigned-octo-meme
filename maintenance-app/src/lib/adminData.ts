'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { planYear } from './constants';
import type { Category, Item, Profile, Region, Store, Submission } from './types';

export interface AdminData {
  regions: Region[];
  stores: Store[];
  categories: Category[];
  submissions: Submission[];
  items: Item[];
  staff: Profile[];
}

/** 관리자 권한 범위(RLS가 자동 제한) 안의 전체 데이터를 불러온다 */
export function useAdminData(enabled: boolean) {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const sb = supabase();
      const year = planYear();
      const [r, s, c, sub, it, st] = await Promise.all([
        sb.from('regions').select('*').order('name'),
        sb.from('stores').select('*').order('name'),
        sb.from('categories').select('*').order('sort'),
        sb.from('submissions').select('*').eq('year', year),
        sb.from('items').select('*, submissions!inner(year)').eq('submissions.year', year).order('created_at'),
        sb.from('profiles').select('*').eq('role', 'staff').order('name'),
      ]);
      for (const x of [r, s, c, sub, it, st]) if (x.error) throw x.error;
      setData({
        regions: r.data as Region[], stores: s.data as Store[], categories: c.data as Category[],
        submissions: sub.data as Submission[], items: it.data as Item[], staff: st.data as Profile[],
      });
      setError(null);
    } catch (e: any) { setError(e?.message ?? '불러오기 실패'); }
  }, []);
  useEffect(() => { if (enabled) void load(); }, [enabled, load]);
  return { data, error, reload: load };
}
