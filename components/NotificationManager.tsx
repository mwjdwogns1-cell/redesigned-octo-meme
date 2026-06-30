'use client';

import { useEffect, useRef, useState } from 'react';
import { Rule } from '@/lib/rules';
import {
  PermissionState,
  currentPermission,
  registerServiceWorker,
  requestPermission,
  runDueNotifications,
} from '@/lib/notifications';

export function NotificationManager({
  rules,
  notificationsEnabled,
  onEnableChange,
}: {
  rules: Rule[];
  notificationsEnabled: boolean;
  onEnableChange: (v: boolean) => void;
}) {
  const [perm, setPerm] = useState<PermissionState>('default');
  const [dismissed, setDismissed] = useState(false);
  const rulesRef = useRef(rules);
  rulesRef.current = rules;

  // SW 등록 + 현재 권한 파악
  useEffect(() => {
    registerServiceWorker();
    setPerm(currentPermission());
  }, []);

  // 권한 granted면 정시 알림 스케줄러 가동 (앱이 열려있는 동안)
  useEffect(() => {
    if (perm !== 'granted') return;
    // 진입 즉시 1회 + 30초마다 체크
    runDueNotifications(rulesRef.current);
    const id = setInterval(() => runDueNotifications(rulesRef.current), 30_000);
    // 탭 복귀 시에도 즉시 체크 (놓친 알림 슬랙 처리)
    const onVis = () => {
      if (document.visibilityState === 'visible') runDueNotifications(rulesRef.current);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [perm]);

  async function enable() {
    const res = await requestPermission();
    setPerm(res);
    onEnableChange(res === 'granted');
  }

  if (perm === 'granted') {
    return notificationsEnabled ? null : (
      <Banner tone="ok">
        ✅ 알림이 켜져 있습니다. 앱이 열려 있는 동안 정시에 리마인드합니다.
      </Banner>
    );
  }

  if (dismissed) return null;

  if (perm === 'unsupported') {
    return (
      <Banner tone="warn" onClose={() => setDismissed(true)}>
        이 브라우저는 알림을 지원하지 않습니다. <b>알림 없이도 체크인은 됩니다.</b>
      </Banner>
    );
  }

  if (perm === 'denied') {
    return (
      <Banner tone="warn" onClose={() => setDismissed(true)}>
        알림이 거부되어 있습니다. <b>알림 없이도 체크인은 됩니다.</b> 켜려면 브라우저
        사이트 설정에서 알림을 허용하세요.
      </Banner>
    );
  }

  // default
  return (
    <Banner tone="cta">
      <div className="flex items-center justify-between gap-3">
        <span>시간대별 리마인더를 받으려면 알림을 허용하세요.</span>
        <button
          onClick={enable}
          className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white"
        >
          알림 켜기
        </button>
      </div>
    </Banner>
  );
}

function Banner({
  children,
  tone,
  onClose,
}: {
  children: React.ReactNode;
  tone: 'ok' | 'warn' | 'cta';
  onClose?: () => void;
}) {
  const cls =
    tone === 'warn'
      ? 'bg-amber-950/40 border-amber-500/30 text-amber-100'
      : tone === 'cta'
      ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-100'
      : 'bg-panel border-line text-slate-300';
  return (
    <div className={`rounded-xl border p-3 text-sm ${cls}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">{children}</div>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 px-1" aria-label="닫기">
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
