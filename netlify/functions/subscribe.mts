// 푸시 구독 저장/삭제 엔드포인트 (Netlify Functions v2).
// 구독 정보는 Netlify Blobs 에 저장한다 (별도 DB 불필요).
//   POST   { subscription }  → 저장
//   DELETE { endpoint }      → 삭제
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function keyOf(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}

export default async (req: Request): Promise<Response> => {
  const store = getStore('push-subscriptions');

  if (req.method === 'POST') {
    let sub: any;
    try {
      sub = await req.json();
    } catch {
      return json({ error: 'invalid json' }, 400);
    }
    // { subscription } 또는 구독 객체 자체 모두 허용
    const subscription = sub?.subscription ?? sub;
    if (!subscription?.endpoint) return json({ error: 'no endpoint' }, 400);
    await store.setJSON(keyOf(subscription.endpoint), subscription);
    return json({ ok: true });
  }

  if (req.method === 'DELETE') {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'invalid json' }, 400);
    }
    if (!body?.endpoint) return json({ error: 'no endpoint' }, 400);
    await store.delete(keyOf(body.endpoint));
    return json({ ok: true });
  }

  return json({ error: 'method not allowed' }, 405);
};
