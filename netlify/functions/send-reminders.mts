// 정시 리마인더 발송 (Netlify Scheduled Function).
// 크론으로 깨어나 현재 KST 시각과 룰 시각을 비교, 일치하는 룰을 모든 구독자에게 푸시.
// 앱이 꺼져 있어도 서버가 보내므로 사용자 기기에서 알림이 뜬다.
//
// 룰 시각이 모두 :00/:30 이라 "매시 0,30분"에만 깨운다. (KST = UTC+9, 분 오프셋 0)
import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import webpush from 'web-push';

export const config: Config = {
  schedule: '0,30 * * * *',
};

// 정시 알림 룰 (lib/rules.ts 의 시간대별 룰과 동일하게 유지)
const RULES = [
  { id: 'morning', time: '08:00', label: '아침', message: '단백질 + 익힌 양배추로. 과일은 곁들임만, 탄수 진입 차단.' },
  { id: 'lunch', time: '12:30', label: '점심', message: '한식 OK. 밥은 2/3, 채소·반찬 먼저 → 밥 나중. 국물은 적게.' },
  { id: 'sugar', time: '15:30', label: '당류(핵심)', message: '당 갈망 시간. "약간만"은 없다. 평일 당류 0. 먹고 싶으면 토요일로 미뤄라.' },
  { id: 'dinnerIF', time: '19:00', label: '저녁 IF', message: '저녁 금식 유지. 1년 10kg 뺀 검증된 무기다.' },
  { id: 'closing', time: '21:00', label: '마감', message: '오늘 체크인 했나? streak 끊지 마라.' },
];

/** UTC 기준 Date → KST(UTC+9) 시각 정보 */
function nowKST() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const hh = kst.getUTCHours();
  const mm = kst.getUTCMinutes();
  const dateStr = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}-${String(kst.getUTCDate()).padStart(2, '0')}`;
  return { minOfDay: hh * 60 + mm, dateStr };
}

export default async (): Promise<Response> => {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    return new Response('VAPID keys not configured', { status: 500 });
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:reminder@example.com',
    pub,
    priv
  );

  const { minOfDay, dateStr } = nowKST();
  // 정시 ~ +4분 슬랙 안에 든 룰만 발송 (크론 지연 흡수)
  const due = RULES.filter((r) => {
    const [h, m] = r.time.split(':').map(Number);
    const delta = minOfDay - (h * 60 + m);
    return delta >= 0 && delta <= 4;
  });
  if (due.length === 0) return new Response('no rules due');

  const store = getStore('push-subscriptions');
  const { blobs } = await store.list();
  if (blobs.length === 0) return new Response('no subscribers');

  let sent = 0;
  let removed = 0;
  for (const rule of due) {
    // 포그라운드 스케줄러와 같은 tag 규칙(`<ruleId>-<날짜>`) → 중복 알림이 하나로 합쳐짐
    const payload = JSON.stringify({
      title: `⏰ ${rule.label}`,
      body: rule.message,
      tag: `${rule.id}-${dateStr}`,
    });
    for (const blob of blobs) {
      const sub = (await store.get(blob.key, { type: 'json' })) as any;
      if (!sub) continue;
      try {
        await webpush.sendNotification(sub, payload);
        sent++;
      } catch (err: any) {
        // 만료/해지된 구독은 정리
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await store.delete(blob.key);
          removed++;
        }
      }
    }
  }

  return new Response(`sent=${sent} removed=${removed} rules=${due.map((r) => r.id).join(',')}`);
};
