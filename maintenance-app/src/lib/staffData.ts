'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { planYear } from './constants';
import type { Category, Inspection, Item, Profile, Store, Submission } from './types';

export interface StaffData {
  store: Store;
  submission: Submission;
  categories: Category[];
  inspections: Inspection[];
  items: Item[];
}

/** 내 지점의 현재 계획연도 제출서 + 분류·점검·항목을 불러온다 */
export function useStaffData(profile: Profile | null) {
  const [data, setData] = useState<StaffData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.store_id) return;
    try {
      const sb = supabase();
      const { data: sid, error: e1 } = await sb.rpc('ensure_submission', { p_year: planYear() });
      if (e1) throw e1;
      const [st, sub, cats, ins, items] = await Promise.all([
        sb.from('stores').select('*').eq('id', profile.store_id).single(),
        sb.from('submissions').select('*').eq('id', sid).single(),
        sb.from('categories').select('*').eq('active', true).order('sort'),
        sb.from('inspections').select('*').eq('submission_id', sid),
        sb.from('items').select('*').eq('submission_id', sid).order('created_at'),
      ]);
      for (const r of [st, sub, cats, ins, items]) if (r.error) throw r.error;
      setData({
        store: st.data as Store, submission: sub.data as Submission, categories: cats.data as Category[],
        inspections: ins.data as Inspection[], items: items.data as Item[],
      });
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? '불러오기 실패 (네트워크 확인)');
    }
  }, [profile?.store_id]);

  useEffect(() => { void load(); }, [load]);
  return { data, error, reload: load };
}
