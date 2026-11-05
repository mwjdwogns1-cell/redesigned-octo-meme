'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { SetupNotice, Spinner } from '@/components/ui';

export default function Home() {
  const { loading, profile, configured } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading || !configured) return;
    if (profile?.status === 'active') router.replace(profile.role === 'admin' ? '/admin' : '/staff');
    else router.replace('/start');
  }, [loading, profile, configured, router]);
  if (!configured) return <SetupNotice />;
  return <Spinner />;
}
