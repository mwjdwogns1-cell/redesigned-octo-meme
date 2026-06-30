// Web Notification API + Service Worker 기반 리마인더.
//
// 한계(솔직히): 백엔드 Push 서버가 없으므로 정시 알림은 "앱(탭/PWA)이 살아있는 동안"
// 페이지 스케줄러가 시각을 비교해 발송한다. 앱이 완전히 종료되면 OS가 알림을
// 누락할 수 있다. 신뢰도가 중요하면 휴대폰 기본 알람 병행을 권장. (README 참고)

import { Rule, scheduledRules } from './rules';
import { dateKey } from './date';

const FIRED_PREFIX = 'diet-reminder/fired';

export type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export function notificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function currentPermission(): PermissionState {
  if (!notificationSupported()) return 'unsupported';
  return Notification.permission as PermissionState;
}

export async function requestPermission(): Promise<PermissionState> {
  if (!notificationSupported()) return 'unsupported';
  try {
    const res = await Notification.requestPermission();
    return res as PermissionState;
  } catch {
    return currentPermission();
  }
}

// ---- Web Push (앱이 꺼져 있어도 서버가 보내는 알림) ----

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
const SUBSCRIBE_ENDPOINT = '/.netlify/functions/subscribe';

/** Web Push 사용 가능 여부 (브라우저 지원 + VAPID 키 설정됨) */
export function pushConfigured(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    VAPID_PUBLIC_KEY.length > 0
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * 푸시 구독 후 서버(Netlify 함수)에 등록.
 * 권한 granted + VAPID 키 설정 시에만 동작. 실패해도 포그라운드 알림은 유지.
 * @returns 구독 성공 여부
 */
export async function subscribeForPush(): Promise<boolean> {
  if (!pushConfigured() || currentPermission() !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      }));
    const res = await fetch(SUBSCRIBE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 서비스워커 등록 (PWA + 알림 표시 주체) */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

async function show(title: string, body: string, tag: string): Promise<void> {
  if (currentPermission() !== 'granted') return;
  const opts: NotificationOptions = {
    body,
    tag,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
  };
  // SW가 있으면 SW로 표시(PWA/백그라운드 호환), 없으면 페이지 Notification
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if (reg) {
      await reg.showNotification(title, opts);
      return;
    }
  }
  new Notification(title, opts);
}

// ---- 중복 발송 방지 (날짜+룰 단위로 하루 1회) ----

function firedKey(day: string): string {
  return `${FIRED_PREFIX}/${day}`;
}

function loadFired(day: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(firedKey(day));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function markFired(day: string, ruleId: string): void {
  const set = loadFired(day);
  set.add(ruleId);
  window.localStorage.setItem(firedKey(day), JSON.stringify([...set]));
}

/** 즉시 알림 (수동 트리거: 술자리 버튼 등) */
export async function triggerNow(rule: Rule): Promise<void> {
  await show(`🍶 ${rule.label}`, rule.message, `manual-${rule.id}-${Date.now()}`);
}

/**
 * 현재 시각 기준으로 발송해야 할 정시 알림을 발송.
 * 매 호출마다 "지금 분(HH:MM)"과 룰 시각을 비교하고, 약간의 지연 허용(슬랙)을 둔다.
 * 이미 오늘 발송한 룰은 건너뜀.
 */
export async function runDueNotifications(rules: Rule[], now: Date = new Date()): Promise<string[]> {
  if (currentPermission() !== 'granted') return [];
  const day = dateKey(now);
  const fired = loadFired(day);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const sent: string[] = [];

  for (const rule of scheduledRules(rules)) {
    if (!rule.time || fired.has(rule.id)) continue;
    const [h, m] = rule.time.split(':').map(Number);
    const ruleMin = h * 60 + m;
    // 정시 ~ +5분 사이면 발송(탭이 잠깐 닫혔다 열린 경우의 슬랙)
    const delta = nowMin - ruleMin;
    if (delta >= 0 && delta <= 5) {
      await show(`⏰ ${rule.label}`, rule.message, `${rule.id}-${day}`);
      markFired(day, rule.id);
      sent.push(rule.id);
    }
  }
  return sent;
}
