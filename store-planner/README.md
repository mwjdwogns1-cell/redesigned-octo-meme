# 매장 3D 플래너 (개인용 · 범용)

평면도(DXF/이미지)를 밑그림으로 깔고, 벽·유리를 그리거나 **선을 따라 라이브러리 집기를 자동 배열(구간 배치)** 해서 3D로 만들고 `.glb`로 내보내는 웹앱.

- 스택: Vite + React + TypeScript + Three.js, 서버 없음 (데이터는 브라우저와 내 파일에만 저장)
- 단위: cm (내보낸 GLB는 m, Y-up)

## 작업 순서
1. **도면 DXF** 또는 **도면 이미지** 올리기 → 길이가 안 맞으면 **축척 맞추기**(두 점 + 실제 mm)
2. 오른쪽 **도면 밑그림**에서 필요 없는 레이어 끄기
3. **벽 W / 유리 G**: 점을 연속 클릭 (밑그림 끝점에 자석 스냅, Shift 직교). 곡선은 [곡선(3점)]
4. 왼쪽 라이브러리에서 아이템 선택 → **구간 배치 A**로 벽 선을 따라 클릭 → 더블클릭/Enter로 확정
   - 선택 후 오른쪽 패널에서 아이템 교체, 정렬, 면 방향, 남는 길이 처리(비워둠/늘리기/보충재), 간격 수정
5. 집기는 클릭 배치 → 드래그 이동, Q/E 회전(Shift=90°), Ctrl+D 복제, Del 삭제
6. **GLB 내보내기** / PNG / 집계표(CSV) / 저장(JSON)

## 단축키
V 선택 · W 벽 · G 유리 · A 구간 배치 · Esc 취소 · Enter 확정 · Ctrl+Z/Y 실행취소/다시

## 저장 포맷
`version / floor(plan.solids, wallStyle, underlay, zones) / items / models / underlays` 구조의 JSON.
`segments`(구간 배치 정의)를 추가로 저장한다. 3D 모델 파일이 없는 저장본은 박스로 표시되며 **모델 연결**로 파일명을 맞춰 연결할 수 있다.

## 라이브러리
- 기본 라이브러리는 **더미 규격**이다. 실제 규격은 `library.json`으로 만들어 [라이브러리 불러오기].
- `+ glb 모델 추가`: glb의 바운딩박스(가로·깊이·높이)를 자동으로 읽어 등록. 원점이 어긋난 모델도 바닥 중앙으로 맞춘다.

## 보안 원칙
회사 도면·집기 규격·제품 모델은 이 저장소(공개)에 넣지 않는다. 실제 데이터는 각 PC에서 파일로만 불러온다.

## 실행 / 배포
```bash
npm install
npm run dev      # 로컬 개발
npm run build    # dist/ 생성
```
Netlify: 새 사이트 → Base directory `store-planner`, Build `npm run build`, Publish `dist` (netlify.toml 포함).
