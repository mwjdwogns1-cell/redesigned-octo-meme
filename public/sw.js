/* 서비스워커: PWA 오프라인 앱 셸 캐시 + 알림 표시/클릭 처리.
   정시 푸시 서버는 없다. 알림은 페이지 스케줄러가 reg.showNotification 으로 띄운다. */

const CACHE = 'diet-reminder-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 네비게이션은 네트워크 우선, 실패 시 캐시(오프라인 셸).
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).catch(() => cached))
  );
});

// 서버(Netlify 스케줄 함수)에서 보낸 Web Push 수신 → 알림 표시.
// 앱이 완전히 종료돼 있어도 브라우저가 이 핸들러를 깨워 알림을 띄운다.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || '식습관 리마인더';
  const options = {
    body: data.body || '',
    tag: data.tag, // 포그라운드 알림과 같은 tag → 중복 시 하나로 합쳐짐
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 페이지에서 직접 못 띄울 때를 위한 메시지 폴백.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(data.title || '리마인더', data.options || {});
  }
});

// 알림 클릭 → 앱 포커스/열기.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
