# 매장 유지보수 앱 (Phase 1)

경북 삼성스토어 지점의 단순 유지보수를 **점검 → 우선순위 리스트 → 지점 제출 → 관리자 일괄 승인**까지 처리하는 모바일 우선 웹앱(PWA).
Next.js 14 + TypeScript + Tailwind / Supabase(Auth·Postgres·Storage·RLS) / Vercel.

이 폴더는 독립 프로젝트입니다. 새 저장소로 옮기려면 이 폴더 내용을 새 저장소 루트로 복사하세요 (`cp -r maintenance-app/. ../new-repo/`).

## 범위 (Phase 1)
| 포함 | 후순위 |
|---|---|
| 매장 선택만으로 시작(이름 기록), 점검(양호/보수필요), 견적용 필수 정보 4단계 입력, 사진 3종(리사이즈·재시도), 로컬 임시저장, 우선순위 리스트(분기별), 지점 제출, 관리자 일괄 승인/반려/보류, 정보 부족 원클릭 반려, 분기·긴급도 수정 이력, 분류 설정, 매장·관리자 대시보드, DB 레벨 RLS | 분류 추가 요청(1.5), 업체·견적(2), 완료 기록(3), 엑셀·이메일 알림 |

금액은 3단계로 분리: ① 예상 구간(관리자, 승인 시 선택) → ② 견적(업체, Phase 2) → ③ 실지출(직원, Phase 3). 직원은 금액을 입력하지 않습니다.

## 설치 순서 (개인 계정 기준)
1. **Supabase 프로젝트 생성** (리전: 가능하면 Seoul). 
2. Authentication → Sign In / Providers → **Anonymous sign-ins 켜기** (직원이 매장 선택만으로 시작하는 데 필요).
3. SQL Editor에서 순서대로 실행: `supabase/migrations/0001_init.sql` → `0002_storage.sql` → `supabase/seed.sql`.
   (seed는 지역 '경북', 분류 9개+기타, **가짜 시드 지점 3곳**을 만듭니다. 실제 지점 등록은 앱 관리자 → 지점·계정에서.)
4. **관리자 계정**: Authentication → Users → Add user(이메일/비밀번호) 후 SQL Editor에서
   ```sql
   insert into public.profiles (id, role, name)
   select id, 'admin', '관리자' from auth.users where email = '내이메일@example.com';
   -- 지역 관리자는 region_id 지정: ..., (select id from public.regions where name = '경북')
   ```
5. 환경변수: `cp .env.example .env.local` 후 Project URL, anon key 입력.
6. `npm install && npm run dev` → 직원은 `/`, 관리자는 `/admin/login`.
7. 배포: Vercel에 이 폴더를 Root Directory로 연결하고 같은 환경변수 2개를 설정.

## 테스트
```bash
npm test          # RLS(타 지점·타 지역 차단, 컬럼 권한, 제출 검증, 승인 흐름) + 입력 검증 단위 테스트
npm run typecheck
```
RLS 테스트는 PGlite(WASM Postgres)에 실제 마이그레이션 SQL을 적용해 실행합니다. Storage 정책(`0002`)은 PGlite에 storage 스키마가 없어 자동 테스트에서 제외되며, Supabase 적용 후 확인이 필요합니다.

## 보안 모델과 주의
- 직원은 **매장 선택 + 이름만으로 바로 사용**합니다(Supabase 익명 로그인 → `join_store` RPC). 따라서 **앱 주소를 아는 사람은 어느 매장이든 선택해 데이터를 보고 입력할 수 있습니다.** 승인 절차 없이 쓰는 대신 이 위험을 받아들이는 설계입니다.
  - 완화: 주소를 사내에만 공유 / 실제 데이터 투입 전 사내 승인 / 필요 시 매장별 가입코드 추가(소규모 변경) / Supabase의 CAPTCHA·rate limit 사용.
  - 익명 사용자는 `auth.users`에 계속 쌓입니다(주기적 정리 필요). 매장 선택 변경은 audit_logs에 기록됩니다.
  - 관리자의 '비활성화'는 해당 기기·세션만 막습니다(다른 기기에서 다시 매장을 선택하면 새 담당자로 시작).
- 권한은 앱 코드가 아니라 DB(RLS + 컬럼 권한 + security definer RPC)에서 강제합니다. 직원은 상태·견적구간·반려사유 컬럼을 직접 수정할 수 없습니다.
- 사진은 비공개 버킷에 `{store_id}/{item_id}/…jpg`로 저장되고 서명 URL로만 열립니다.

## 알려진 한계 (Phase 1)
- 계획 연도: `NEXT_PUBLIC_PLAN_YEAR` 또는 (10월 이후면 다음 해). 연도 전환 UI는 없음.
- 오프라인: 항목 입력 텍스트는 즉시 로컬 보관, 사진은 업로드 실패 시 재시도 버튼. 서비스워커 캐시는 없어 **완전 오프라인 실행은 불가**(전파가 끊겨도 입력은 보존, 저장·제출은 연결 필요). 점검 양호/보수필요 토글은 서버 저장 방식이라 끊기면 재시도.
- 작성 중 취소한 항목의 사진은 스토리지에 남을 수 있음(정리 작업 미구현).
- 관리자 목록은 모든 화면 폭에서 카드형. PC 표 형태는 미구현.
- PWA 홈 화면 추가는 manifest만 제공(서비스워커 없음).
