-- 기본 데이터: 지역, 분류 9개 + 기타, 시드 지점 3곳 (가짜 이름 — 사내 승인 전 실제 지점 데이터 투입 금지)
-- 필수 항목 정의(JSON): key, label, type(select|number|text), options, unit, required, unknown(모름 허용)
insert into public.regions (name) values ('경북');

insert into public.categories (name, default_urgency, units, required_fields, sort) values
('도장보수', 'normal', '{㎡,m,개소}', $j$[
  {"key":"surface","label":"대상 면","type":"select","options":["벽","천장","바닥","외벽"],"required":true},
  {"key":"finish","label":"기존 마감","type":"select","options":["페인트","타일","벽지","기타"],"required":true,"unknown":true}]$j$, 1),
('주차장 스토퍼/라인', 'normal', '{구획,개,m}', $j$[
  {"key":"work_type","label":"재도색/신설","type":"select","options":["재도색","신설"],"required":true},
  {"key":"stopper_count","label":"스토퍼 개수","type":"number","unit":"개","required":true,"unknown":true},
  {"key":"line_length_m","label":"라인 길이","type":"number","unit":"m","required":false,"unknown":true}]$j$, 2),
('누수', 'urgent', '{개소,㎡}', $j$[
  {"key":"leak_part","label":"누수 부위","type":"select","options":["천장","벽","바닥"],"required":true},
  {"key":"degree","label":"정도","type":"select","options":["얼룩","젖음","낙수"],"required":true},
  {"key":"rain_only","label":"우천 시만","type":"select","options":["예","아니오"],"required":true,"unknown":true},
  {"key":"upper_floor","label":"위층","type":"select","options":["있음","없음"],"required":true,"unknown":true},
  {"key":"damaged_sqm","label":"훼손 면적","type":"number","unit":"㎡","required":true,"unknown":true}]$j$, 3),
('조명', 'urgent', '{개}', $j$[
  {"key":"light_type","label":"조명 종류","type":"select","options":["평판","다운라이트","트랙","간판","기타"],"required":true},
  {"key":"height","label":"설치 높이","type":"select","options":["3m 이하","3~5m","5m 초과"],"required":true,"unknown":true},
  {"key":"scope","label":"교체 범위","type":"select","options":["램프만","기구 교체"],"required":true}]$j$, 4),
('바닥타일 파손', 'normal', '{장,㎡}', $j$[
  {"key":"tile_size","label":"타일 규격(cm)","type":"text","required":true,"unknown":true},
  {"key":"stock","label":"동일 자재 재고","type":"select","options":["있음","없음"],"required":true,"unknown":true}]$j$, 5),
('전기보수', 'urgent', '{개소}', $j$[
  {"key":"symptom_type","label":"증상 구분","type":"select","options":["차단기 트립","콘센트·스위치 불량","기타"],"required":true},
  {"key":"outage_ok","label":"정전 작업 가능","type":"select","options":["가능","불가"],"required":true,"unknown":true}]$j$, 6),
('통신(랜선)', 'normal', '{포인트,m}', $j$[
  {"key":"work_type","label":"신설/교체/단선","type":"select","options":["신설","교체","단선"],"required":true},
  {"key":"distance_m","label":"대략 구간 거리","type":"number","unit":"m","required":true,"unknown":true},
  {"key":"route","label":"배선 경로","type":"select","options":["천장","벽","바닥"],"required":true,"unknown":true}]$j$, 7),
('CCTV', 'urgent', '{대}', $j$[
  {"key":"symptom_type","label":"증상","type":"select","options":["영상 없음","화질","각도","기타"],"required":true},
  {"key":"work_type","label":"신설/교체/이설","type":"select","options":["신설","교체","이설"],"required":true}]$j$, 8),
('공용부 보수', 'low', '{개,장,m,㎡,개소}', $j$[
  {"key":"target","label":"보수 대상","type":"text","required":true}]$j$, 9),
('기타', 'normal', '{개,장,m,㎡,개소}', $j$[
  {"key":"target","label":"보수 대상","type":"text","required":true}]$j$, 99);

insert into public.stores (region_id, name)
select r.id, s.name from public.regions r, (values ('[시드] 포항점'), ('[시드] 구미점'), ('[시드] 안동점')) as s(name)
where r.name = '경북';
