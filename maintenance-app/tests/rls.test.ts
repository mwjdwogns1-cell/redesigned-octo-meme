import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { setupDb, newUser, as, asAnon, rejects } from './db.ts';

let db: PGlite;
let regionA: string, regionB: string, storeA: string, storeB: string, storeC: string;
let staffA: string, staffB: string, adminAll: string, adminRegionA: string, adminRegionB: string;
let cats: { id: string; name: string }[];

const one = async (sql: string, params: unknown[] = []) => (await db.query<any>(sql, params)).rows[0];
const rows = async (sql: string, params: unknown[] = []) => (await db.query<any>(sql, params)).rows;

before(async () => {
  db = await setupDb();
  regionA = (await one(`select id from regions where name='경북'`)).id;
  regionB = (await one(`insert into regions (name) values ('경남') returning id`)).id;
  const stores = await rows(`select id, name from stores order by name`);
  storeA = stores[0].id; storeB = stores[1].id; // 둘 다 경북
  storeC = (await one(`insert into stores (region_id, name) values ($1, '[시드] 부산점') returning id`, [regionB])).id;
  staffA = await newUser(db, { role: 'staff', store: storeA, name: '담당자A' });
  staffB = await newUser(db, { role: 'staff', store: storeB, name: '담당자B' });
  adminAll = await newUser(db, { role: 'admin', name: '전체관리자' });
  adminRegionA = await newUser(db, { role: 'admin', region: regionA, name: '경북관리자' });
  adminRegionB = await newUser(db, { role: 'admin', region: regionB, name: '경남관리자' });
  cats = await rows(`select id, name from categories where active order by sort`);
});

/** 직원 A가 유효한 항목 1건(사진 2장 포함)을 만든다 */
async function makeItem(uid: string, store: string, catName = '누수') {
  const cat = cats.find((c) => c.name === catName)!;
  return as(db, uid, async () => {
    const sid = (await one(`select public.ensure_submission(2027) as id`)).id;
    const itemId = randomUUID();
    await db.query(
      `insert into items (id, submission_id, store_id, category_id, area, location_detail, symptom, onset, qty, unit,
         work_when, high_place, extra, urgency, quarter)
       values ($1,$2,$3,$4,'매장 내부','입구 천장','물이 떨어짐','recent',2,'개소','anytime','no',
         '{"leak_part":"천장","degree":"낙수","rain_only":"예","upper_floor":"없음","damaged_sqm":"__unknown__"}','urgent','now')`,
      [itemId, sid, store, cat.id],
    );
    await db.query(`insert into item_photos (item_id, store_id, kind, path) values ($1,$2,'wide','a'),($1,$2,'close','b')`, [itemId, store]);
    return { sid, itemId, cat };
  });
}

/** 모든 분류를 점검 처리한다 (누수만 보수필요) */
async function inspectAll(uid: string, sid: string, repairCat = '누수') {
  await as(db, uid, async () => {
    for (const c of cats) {
      await db.query(`insert into inspections (submission_id, store_id, category_id, result)
        select $1, s.store_id, $2, $3 from submissions s where s.id=$1`, [sid, c.id, c.name === repairCat ? 'needs_repair' : 'ok']);
    }
  });
}

test('anon 키만으로는 아무 것도 읽지 못한다', async () => {
  await asAnon(db, async () => {
    assert.ok(await rejects(db.query('select * from stores')));
    assert.ok(await rejects(db.query('select * from items')));
    assert.ok(await rejects(db.query(`select public.join_store('${storeA}','x')`)));
  });
});

test('프로필 없는 로그인 사용자는 매장 데이터를 볼 수 없다', async () => {
  const uid = randomUUID();
  await db.query('insert into auth.users (id) values ($1)', [uid]);
  await as(db, uid, async () => {
    assert.equal((await rows('select * from items')).length, 0);
    assert.equal((await rows('select * from submissions')).length, 0);
  });
});

test('join_store: 매장 선택만으로 즉시 직원 프로필이 생기고, 관리자 계정은 덮어쓸 수 없다', async () => {
  const uid = randomUUID();
  await db.query('insert into auth.users (id) values ($1)', [uid]);
  await as(db, uid, async () => {
    await db.query(`select public.join_store($1, '홍길동', '010-0000-0000')`, [storeA]);
    const p = await one('select role, store_id, name from profiles where id = auth.uid()');
    assert.deepEqual([p.role, p.store_id, p.name], ['staff', storeA, '홍길동']);
    assert.ok(await rejects(db.query(`select public.join_store($1, '')`, [storeA])), '이름 필수');
  });
  await as(db, adminAll, async () => {
    assert.ok(await rejects(db.query(`select public.join_store($1, '탈취')`, [storeA])));
  });
});

test('타 지점 직원은 다른 지점의 점검·항목·사진·제출을 볼 수 없다', async () => {
  const { sid } = await makeItem(staffA, storeA);
  await as(db, staffB, async () => {
    assert.equal((await rows('select * from items')).length, 0);
    assert.equal((await rows('select * from item_photos')).length, 0);
    assert.equal((await rows('select * from submissions where id=$1', [sid])).length, 0);
    assert.equal((await rows('select * from profiles where id=$1', [staffA])).length, 0);
    assert.equal((await rows('select * from audit_logs')).length, 0);
  });
});

test('타 지점 제출서에 항목을 넣거나 타 지점 항목을 수정·삭제할 수 없다', async () => {
  const { sid, itemId, cat } = await makeItem(staffA, storeA);
  await as(db, staffB, async () => {
    assert.ok(await rejects(db.query(
      `insert into items (submission_id, store_id, category_id, area, location_detail, symptom, onset, work_when, urgency, quarter)
       values ($1,$2,$3,'x','x','x','x','anytime','low','q1')`, [sid, storeB, cat.id])));
    assert.ok(await rejects(db.query(
      `insert into items (submission_id, store_id, category_id, area, location_detail, symptom, onset, work_when, urgency, quarter)
       values ($1,$2,$3,'x','x','x','x','anytime','low','q1')`, [sid, storeA, cat.id])));
    const upd = await db.query(`update items set symptom='해킹' where id=$1`, [itemId]);
    assert.equal(upd.affectedRows, 0);
    const del = await db.query(`delete from items where id=$1`, [itemId]);
    assert.equal(del.affectedRows, 0);
  });
});

test('직원은 상태·견적구간·반려사유를 직접 바꿀 수 없다 (컬럼 권한)', async () => {
  const { itemId } = await makeItem(staffA, storeA);
  await as(db, staffA, async () => {
    assert.ok(await rejects(db.query(`update items set status='approved' where id=$1`, [itemId])));
    assert.ok(await rejects(db.query(`update items set estimate_band='lt50' where id=$1`, [itemId])));
    assert.ok(await rejects(db.query(`update items set store_id=$2 where id=$1`, [itemId, storeB])));
    assert.ok(await rejects(db.query(`insert into audit_logs (entity, action) values ('x','y')`)));
    assert.equal((await db.query(`update categories set name='x'`)).affectedRows, 0, '정책이 막아 0행');
    assert.ok(await rejects(db.query(`select public.admin_review_items(array['${itemId}']::uuid[], 'approve')`)));
  });
});

test('제출 검증: 점검 미완료·사진 부족·필수 항목 누락이면 제출이 막힌다', async () => {
  const { sid, itemId } = await makeItem(staffA, storeA);
  await as(db, staffA, async () => {
    const r1 = (await one(`select public.submit_submission($1) as r`, [sid])).r;
    assert.equal(r1.ok, false);
    assert.ok(r1.errors.some((e: any) => e.msg === '점검 미완료'));
  });
  await inspectAll(staffA, sid);
  await as(db, staffA, async () => {
    await db.query(`delete from item_photos where item_id=$1 and kind='close'`, [itemId]);
    const r2 = (await one(`select public.submit_submission($1) as r`, [sid])).r;
    assert.ok(r2.errors.some((e: any) => e.msg === '사진 2장 이상 필요'));
    await db.query(`insert into item_photos (item_id, store_id, kind, path) values ($1,$2,'close','b2')`, [itemId, storeA]);
    await db.query(`update items set extra = '{"leak_part":"천장"}' where id=$1`, [itemId]);
    const r3 = (await one(`select public.submit_submission($1) as r`, [sid])).r;
    assert.ok(r3.errors.some((e: any) => e.msg === '정도 필요'));
  });
});

test('전체 흐름: 제출 → 관리자 일괄 승인/반려/보류 → 직원 수정·재제출', async () => {
  const staff = await newUser(db, { role: 'staff', store: storeB, name: '흐름' });
  // 같은 제출서에 항목 3건
  const first = await makeItem(staff, storeB);
  const ids = [first.itemId];
  await as(db, staff, async () => {
    for (let i = 0; i < 2; i++) {
      const id = randomUUID(); ids.push(id);
      await db.query(
        `insert into items (id, submission_id, store_id, category_id, area, location_detail, symptom, onset, qty, unit,
           work_when, extra, urgency, quarter)
         values ($1,$2,$3,$4,'주차장','기둥','누수','recent',1,'개소','night',
           '{"leak_part":"벽","degree":"얼룩","rain_only":"예","upper_floor":"있음","damaged_sqm":"1"}','normal','q2')`,
        [id, first.sid, storeB, first.cat.id]);
      await db.query(`insert into item_photos (item_id, store_id, kind, path) values ($1,$2,'wide','a'),($1,$2,'scale','c')`, [id, storeB]);
    }
  });
  await inspectAll(staff, first.sid);
  await as(db, staff, async () => {
    const r = (await one(`select public.submit_submission($1) as r`, [first.sid])).r;
    assert.deepEqual([r.ok, r.count], [true, 3]);
  });
  // 제출 후 직원은 항목 추가·수정 불가
  await as(db, staff, async () => {
    const upd = await db.query(`update items set symptom='수정' where id=$1`, [ids[0]]);
    assert.equal(upd.affectedRows, 0);
  });
  // 다른 지역 관리자는 처리할 수 없음 (0건), 같은 지역 관리자는 가능
  await as(db, adminRegionB, async () => {
    assert.equal((await rows('select * from items where id = any($1)', [ids])).length, 0);
    const n = (await one(`select public.admin_review_items($1::uuid[], 'approve') as n`, [ids])).n;
    assert.equal(n, 0);
  });
  await as(db, adminRegionA, async () => {
    assert.equal((await rows('select * from items where id = any($1)', [ids])).length, 3);
    assert.ok(await rejects(db.query(`select public.admin_review_items($1::uuid[], 'reject')`, [[ids[1]]])), '반려 사유 필수');
    const a = (await one(`select public.admin_review_items($1::uuid[], 'approve', null, '[]', '50to200') as n`, [[ids[0]]])).n;
    const r = (await one(`select public.admin_review_items($1::uuid[], 'reject', '정보 부족', '["수량","사진"]') as n`, [[ids[1]]])).n;
    const h = (await one(`select public.admin_review_items($1::uuid[], 'hold', '예산 확인') as n`, [[ids[2]]])).n;
    assert.deepEqual([a, r, h], [1, 1, 1]);
    await db.query(`select public.admin_adjust_item($1, 'q4', 'low')`, [ids[2]]);
    const log = await rows(`select action from audit_logs where entity_id=$1 order by id`, [ids[2]]);
    assert.deepEqual(log.map((l) => l.action), ['hold', 'adjust']);
  });
  // 승인된 건은 직원이 수정 불가, 반려된 건은 수정 가능 → 재제출
  await as(db, staff, async () => {
    assert.equal((await db.query(`update items set symptom='x' where id=$1`, [ids[0]])).affectedRows, 0);
    const rej = await one(`select status, reject_reason, reject_missing from items where id=$1`, [ids[1]]);
    assert.deepEqual([rej.status, rej.reject_reason, rej.reject_missing], ['rejected', '정보 부족', ['수량', '사진']]);
    assert.equal((await db.query(`update items set qty=5 where id=$1`, [ids[1]])).affectedRows, 1);
    const r = (await one(`select public.submit_submission($1) as r`, [first.sid])).r;
    assert.deepEqual([r.ok, r.count], [true, 1]);
    assert.equal((await one(`select status, reject_reason from items where id=$1`, [ids[1]])).status, 'submitted');
  });
});

test('needs_survey: 수량·필수항목에 "모름"이 있으면 자동으로 실사 필요가 켜진다', async () => {
  const { itemId } = await makeItem(staffA, storeA); // damaged_sqm = __unknown__
  assert.equal((await one(`select needs_survey from items where id=$1`, [itemId])).needs_survey, true);
  await as(db, staffA, async () => {
    await db.query(`update items set extra='{"leak_part":"벽"}' where id=$1`, [itemId]);
  });
  assert.equal((await one(`select needs_survey from items where id=$1`, [itemId])).needs_survey, false);
});

test('분류 설정은 전체 관리자만, 지점 등록은 담당 지역 관리자만 가능', async () => {
  await as(db, adminRegionA, async () => {
    assert.equal((await db.query(`update categories set default_urgency='low' where name='누수'`)).affectedRows, 0);
    await db.query(`insert into stores (region_id, name) values ($1, '[시드] 경주점')`, [regionA]);
    assert.ok(await rejects(db.query(`insert into stores (region_id, name) values ($1, '남의 지역')`, [regionB])));
  });
  await as(db, adminAll, async () => {
    const r = await db.query(`update categories set default_urgency='low' where name='누수'`);
    assert.equal(r.affectedRows, 1);
    await db.query(`update categories set default_urgency='urgent' where name='누수'`);
  });
});

test('사용자 비활성화: 비활성 직원은 데이터 접근이 막힌다', async () => {
  const staff = await newUser(db, { role: 'staff', store: storeA, name: '퇴사예정' });
  await makeItem(staff, storeA);
  await as(db, adminRegionB, async () => {
    assert.ok(await rejects(db.query(`select public.admin_set_user_status($1, 'inactive')`, [staff])), '타 지역 관리자 불가');
  });
  await as(db, adminRegionA, async () => { await db.query(`select public.admin_set_user_status($1, 'inactive')`, [staff]); });
  await as(db, staff, async () => {
    assert.equal((await rows('select * from items')).length, 0);
    assert.ok(await rejects(db.query(`select public.ensure_submission(2027)`)));
  });
});
