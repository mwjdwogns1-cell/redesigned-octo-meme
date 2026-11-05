'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/** 방금 찍은 사진은 로컬 미리보기, 이미 올라간 사진은 서명 URL로 보여준다 */
export const previewCache = new Map<string, string>();

export function PhotoImg({ path, className = '' }: { path: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(previewCache.get(path) ?? null);
  useEffect(() => {
    if (src) return;
    let alive = true;
    supabase().storage.from('item-photos').createSignedUrl(path, 3600).then(({ data }) => {
      if (alive && data?.signedUrl) { previewCache.set(path, data.signedUrl); setSrc(data.signedUrl); }
    });
    return () => { alive = false; };
  }, [path, src]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" className={`object-cover ${className}`} /> : <div className={`animate-pulse bg-slate-200 ${className}`} />;
}
