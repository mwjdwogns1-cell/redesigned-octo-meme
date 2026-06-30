# 식습관 리마인더 PWA

정해진 **식습관 규칙을 시간대별로 리마인드**하고, 지켰는지 **체크인·기록**하는 모바일 우선 PWA.
새 식단/운동을 추가하는 앱이 아니라, 이미 정한 규칙을 "잊지 않게" 만드는 도구다.

- **스택**: Next.js(App Router) + TypeScript + Tailwind CSS
- **저장**: 브라우저 `localStorage` (백엔드·DB 없음, 1인용)
- **알림**: Web Notification API + Service Worker
- **배포**: Netlify 정적 export (`output: 'export'` → `out/`)

## 주요 기능

1. **시간대별 리마인더** — 08:00 아침 / 12:30 점심 / 15:30 당류(핵심) / 19:00 저녁 IF / 21:00 마감
2. **수동 트리거** — "🍶 술자리 시작" 빨간 버튼으로 즉시 알림
3. **데일리 체크인** — 룰 카드 탭으로 `미체크 → 지킴 → 어김` 순환, 날짜별 저장
4. **연속 달성(streak) + 주간 통계** — "평일 당류 0" 연속 일수, 이번 주 달성률 %
5. **치팅 카운터** — 주 1회(토요일) 허용량, 이번 주 남은 횟수 시각화

## 로컬 실행

```bash
npm install
npm run dev      # http://localhost:3000
```

정적 빌드 / 미리보기:

```bash
npm run build    # out/ 생성 (정적 export)
npx serve out    # 빌드 결과 로컬 확인
```

## Netlify 배포

이 저장소에는 `netlify.toml`이 포함되어 있어 추가 설정 없이 배포된다.

- **Build command**: `npm run build`
- **Publish directory**: `out`

방법 A — 대시보드: Netlify에서 "Add new site → Import an existing project"로 이 repo를 연결하면 `netlify.toml` 설정이 자동 적용된다.

방법 B — CLI:

```bash
npm i -g netlify-cli
npm run build
netlify deploy --prod --dir=out
```

> 서비스워커/매니페스트는 항상 최신본을 받도록 `netlify.toml`에서 캐시를 비활성화해 두었다.

## 홈 화면에 추가 (PWA)

배포된 사이트를 모바일 브라우저로 열고 **"홈 화면에 추가"** 를 선택하면 standalone 앱처럼 실행된다.
첫 진입 시 알림 권한을 요청하며, 거부해도 체크인·streak 등 핵심 기능은 그대로 동작한다.

## 🔔 백그라운드 알림 (앱이 꺼져 있어도 알림 받기)

기본 동작은 "앱이 열려 있을 때" 알림이지만, **Web Push**를 켜면 앱을 꺼놔도 정시에 알림이 온다.
별도 서버/DB 없이 **Netlify 서버리스 함수**로 동작한다.

- `netlify/functions/subscribe.mts` — 구독 저장 (Netlify Blobs)
- `netlify/functions/send-reminders.mts` — **스케줄 함수**(크론 `0,30 * * * *`)가 KST 시각과 룰을 비교해 푸시 발송
- 서비스워커 `push` 핸들러가 알림 표시

### 설정 (VAPID 키 3개를 Netlify 환경변수로)

1. 키 생성: `npx web-push generate-vapid-keys`
2. Netlify → Site configuration → **Environment variables** 에 등록:

   | 변수 | 값 |
   |---|---|
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 공개 키 (빌드 시 클라이언트에 주입) |
   | `VAPID_PUBLIC_KEY` | 공개 키 (함수용, 위와 동일) |
   | `VAPID_PRIVATE_KEY` | 비공개 키 (절대 커밋 금지) |
   | `VAPID_SUBJECT` | `mailto:본인이메일` (선택) |

3. **Deploys → Trigger deploy** 로 재배포 (env 반영은 새 빌드 필요)
4. 앱에서 알림을 허용하면 백그라운드 구독이 자동 등록되고, 배너가
   "백그라운드 알림이 켜졌습니다"로 바뀐다.

> 키를 설정하지 않으면 푸시는 비활성화되고, 기존처럼 "앱 열려 있을 때만" 동작한다(앱은 정상 작동).
>
> **iOS**는 "홈 화면에 추가"한 PWA + iOS 16.4 이상에서만 Web Push가 동작한다. 안드로이드 크롬은 그냥 된다.

## ⚠️ 알림 한계 (꼭 읽기)

- **Web Push 미설정 시**: 정시 알림은 **앱(탭/PWA)이 살아있는 동안**만 페이지 스케줄러가 발송한다.
  앱을 완전히 종료하면 누락될 수 있고, 탭 복귀 시 정시~+5분 내 놓친 알림은 보정 발송된다.
- **Web Push 설정 시**: 앱을 꺼놔도 서버(Netlify 스케줄 함수)가 발송한다. 단 크론 특성상 **±1분 오차**가
  있을 수 있고, 기기 절전·네트워크·푸시 서비스 상태에 따라 드물게 누락될 수 있다.

**어느 경우든, 절대 놓치면 안 되는 시각(예: 15:30 당류, 19:00 저녁 IF)은 휴대폰 기본 알람을 함께
맞춰두는 것을 권장한다.** 이 안내는 앱 하단에도 표시된다.

## 요일/날짜 처리

- **요일 분기**: 평일(월~금)/주말 룰이 다르다. "평일 당류 0"이 핵심 추적 지표이며, 치팅 카운터는 **토요일에만** 사용 버튼이 활성화된다.
- **자정 롤오버**: 날짜가 바뀌면 오늘 체크는 자동 초기화되고(새 날짜키), **어제까지의 기록은 보존**된다.
- **첫 실행**: `localStorage`가 비어 있으면 기본 룰 시드가 자동 주입된다.

## 핵심 로직 위치

| 로직 | 파일 |
|---|---|
| 알림 스케줄링 / 권한 / 중복 방지 | `lib/notifications.ts` |
| streak 계산 (평일만 카운트, 주말 건너뜀, 과거 미기록 시 끊김) | `lib/streak.ts` |
| 요일 분기 · 주 시작(월요일) · 날짜키 | `lib/date.ts` |
| localStorage 영속화 · 시드 · 체크인/치팅 조작 | `lib/storage.ts` |
| 규칙 시드 데이터(문구·시각) | `lib/rules.ts` |
| 서비스워커(오프라인 셸 + 알림 표시/클릭) | `public/sw.js` |

### streak 계산 요약
오늘부터 과거로 거슬러 가며 **평일만** 본다. 주말은 끊지 않고 건너뛴다. 평일이 "지킴"이면 +1,
"어김"이면 중단, 과거 평일이 미기록이면 중단(오늘은 아직 미완료로 간주해 건너뜀).

### 알림 스케줄링 요약
권한이 `granted`이면 진입 즉시 1회 + 30초 간격으로 `runDueNotifications`가 돈다. 현재 분과 룰
시각을 비교해 정시~+5분 슬랙 안이면 발송하고, `localStorage`에 "날짜+룰" 단위로 발송 여부를
기록해 하루 1회만 보낸다.

---

> 참고: 이 저장소에 남아 있던 이전 예제(`app.py`, `templates/`, `INDEX.HTML` 등 Google OAuth 데모)는
> 이번 PWA와 무관한 레거시 파일이다.
