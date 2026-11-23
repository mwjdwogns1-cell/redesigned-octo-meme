/**
 * ============================================================
 *  삼성스토어 대구·경북 VMD 취합 시스템
 *  Google Apps Script (스프레드시트 바인딩형)
 *
 *  - 지점: 폰에서 링크 열고 사진 첨부 → 제출 (로그인 불필요)
 *  - 사진: 자동 압축 → 드라이브에 연/월/지점별 자동 정리
 *  - 관리: 제출대장 시트 + 주간현황 + 미제출 자동 알림
 *
 *  설치 방법은 vmd/설치가이드.md 참고
 * ============================================================
 */

/** ---------- 기본 설정 ---------- */
const CFG = {
  ROOT_FOLDER_NAME: 'VMD_대구경북',
  S_STORE: '지점마스터',
  S_LOG: '제출대장',
  S_WEEK: '주간현황',
  S_SET: '설정',
  TZ: 'Asia/Seoul',
  MAX_PHOTOS: 10
};

/** 취합 항목 (여기만 고치면 폼·현황판에 자동 반영) */
const CHECK_ITEMS = [
  '신제품 연출',
  '진열 완료',
  '클린샵 체크',
  '현장 전파 확인',
  '기타 이슈'
];

/** 대구·경북 22개 지점 (지점명, 지역, 유형) */
const STORE_MASTER = [
  ['동대구',     '대구', '직영점'],
  ['서대구',     '대구', '직영점'],
  ['북대구',     '대구', '직영점'],
  ['남대구',     '대구', '직영점'],
  ['상인역',     '대구', '직영점'],
  ['성서',       '대구', '직영점'],
  ['더현대대구', '대구', '백화점'],
  ['신세계대구', '대구', '백화점'],
  ['대백프라자', '대구', '백화점'],
  ['롯데대구',   '대구', '백화점'],
  ['롯데상인',   '대구', '백화점'],
  ['포항',       '경북', '직영점'],
  ['북포항',     '경북', '직영점'],
  ['롯데포항',   '경북', '백화점'],
  ['구미',       '경북', '직영점'],
  ['안동',       '경북', '직영점'],
  ['경주',       '경북', '직영점'],
  ['서경주',     '경북', '직영점'],
  ['김천',       '경북', '직영점'],
  ['영천',       '경북', '직영점'],
  ['영주',       '경북', '직영점'],
  ['상주',       '경북', '직영점']
];

const LOG_HEADERS = [
  '제출일시', '주시작일', '주차', '지점', '지역', '제출자',
  '점검항목', '촬영일', '사진수', '사진보기', '폴더ID',
  '특이사항', '검토상태', 'VMD코멘트'
];


/** ============================================================
 *  메뉴
 *  ============================================================ */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📋 VMD 관리')
    .addItem('① 최초 설정 실행', 'setup')
    .addItem('② 제출 링크 보기', 'showLinks')
    .addItem('③ 지점별 전용 링크 만들기', 'buildStoreLinks')
    .addSeparator()
    .addItem('이번 주 현황 새로고침', 'refreshWeekSheet')
    .addItem('미제출 알림 지금 보내기', 'sendReminderNow')
    .addToUi();
}


/** ============================================================
 *  ① 최초 설정 — 시트 / 지점마스터 / 드라이브 폴더 / 트리거 생성
 *  ============================================================ */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(CFG.TZ);

  // --- 지점마스터 ---
  const st = getOrCreateSheet_(ss, CFG.S_STORE);
  if (st.getLastRow() < 2) {
    st.clear();
    st.getRange(1, 1, 1, 6)
      .setValues([['지점명', '지역', '유형', '담당자', '알림이메일', '활성']])
      .setFontWeight('bold').setBackground('#1428A0').setFontColor('#ffffff');
    const rows = STORE_MASTER.map(function (s) { return [s[0], s[1], s[2], '', '', 'Y']; });
    st.getRange(2, 1, rows.length, 6).setValues(rows);
    st.setFrozenRows(1);
    st.setColumnWidth(1, 110);
    st.setColumnWidth(5, 200);
  }

  // --- 제출대장 ---
  const lg = getOrCreateSheet_(ss, CFG.S_LOG);
  if (lg.getLastRow() < 1 || lg.getRange(1, 1).getValue() !== LOG_HEADERS[0]) {
    lg.getRange(1, 1, 1, LOG_HEADERS.length)
      .setValues([LOG_HEADERS])
      .setFontWeight('bold').setBackground('#1428A0').setFontColor('#ffffff');
    lg.setFrozenRows(1);
    lg.hideColumns(11); // 폴더ID
    lg.setColumnWidth(7, 200);
    lg.setColumnWidth(12, 260);
  }

  // --- 주간현황 ---
  getOrCreateSheet_(ss, CFG.S_WEEK);

  // --- 설정 ---
  const cf = getOrCreateSheet_(ss, CFG.S_SET);
  if (cf.getLastRow() < 2) {
    cf.clear();
    cf.getRange(1, 1, 1, 3)
      .setValues([['항목', '값', '설명']])
      .setFontWeight('bold').setBackground('#1428A0').setFontColor('#ffffff');
    cf.getRange(2, 1, 4, 3).setValues([
      ['관리자이메일', Session.getEffectiveUser().getEmail(), '미제출 알림을 받을 주소'],
      ['마감요일',     '금',                                   '주간 제출 마감 요일'],
      ['현황판PIN',    String(Math.floor(1000 + Math.random() * 9000)), '현황판 주소 뒤 &k= 에 붙는 숫자'],
      ['사진최대크기', '1600',                                 '긴 변 픽셀. 작을수록 용량 절약']
    ]);
    cf.setColumnWidth(2, 240);
    cf.setColumnWidth(3, 320);
    cf.setFrozenRows(1);
  }

  // --- 드라이브 루트 폴더 ---
  const root = getOrCreateFolder_(DriveApp.getRootFolder(), CFG.ROOT_FOLDER_NAME);
  PropertiesService.getScriptProperties().setProperty('ROOT_ID', root.getId());

  // --- 주간 트리거 (매주 금 17시 미제출 알림) ---
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'weeklyReminder') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('weeklyReminder')
    .timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(17)
    .inTimezone(CFG.TZ).create();

  refreshWeekSheet();

  SpreadsheetApp.getUi().alert(
    '설정 완료',
    '시트 4개, 드라이브 폴더(' + CFG.ROOT_FOLDER_NAME + '), 주간 알림 트리거가 만들어졌습니다.\n\n' +
    '다음 단계: 배포 ▸ 새 배포 ▸ 웹 앱 으로 배포한 뒤\n' +
    '메뉴 [📋 VMD 관리 ▸ ② 제출 링크 보기] 를 누르세요.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}


/** ============================================================
 *  ② 제출 링크 보기 — 지점 배포용 링크 + 관리자 현황판 링크
 *  ============================================================ */
function showLinks() {
  var url;
  try { url = ScriptApp.getService().getUrl(); } catch (e) { url = ''; }
  if (!url) {
    SpreadsheetApp.getUi().alert('아직 웹앱으로 배포되지 않았습니다.\n\n배포 ▸ 새 배포 ▸ 유형 [웹 앱]\n실행 계정: 나\n액세스 권한: 모든 사용자\n\n배포 후 다시 눌러주세요.');
    return;
  }
  const pin = getSetting_('현황판PIN', '');
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:-apple-system,Malgun Gothic,sans-serif;padding:8px;line-height:1.7">' +
    '<h3 style="margin:0 0 12px">지점 배포용 링크</h3>' +
    '<p style="margin:0 0 6px;color:#555;font-size:13px">단톡방에 이 링크만 공유하세요. 로그인 필요 없습니다.</p>' +
    '<input style="width:100%;padding:8px;font-size:12px" value="' + url + '" onclick="this.select()">' +
    '<h3 style="margin:20px 0 12px">관리자 현황판 (담당자님 전용)</h3>' +
    '<input style="width:100%;padding:8px;font-size:12px" value="' + url + '?page=admin&k=' + pin + '" onclick="this.select()">' +
    '<p style="margin:14px 0 0;color:#888;font-size:12px">두 링크 모두 폰 홈화면에 추가해두면 앱처럼 쓸 수 있습니다.</p>' +
    '</div>'
  ).setWidth(520).setHeight(340);
  SpreadsheetApp.getUi().showModalDialog(html, '제출 링크');
}


/** ============================================================
 *  ③ 지점별 전용 링크 — 지점마스터 G열에 22개 링크 자동 생성
 *     (지점이 미리 선택된 링크라 선택 실수가 없어집니다)
 *  ============================================================ */
function buildStoreLinks() {
  const ui = SpreadsheetApp.getUi();
  var url;
  try { url = ScriptApp.getService().getUrl(); } catch (e) { url = ''; }
  if (!url) {
    ui.alert('먼저 웹 앱으로 배포해주세요.\n\n배포 ▸ 새 배포 ▸ 웹 앱\n실행 계정: 나 / 액세스: 모든 사용자');
    return;
  }

  const st = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.S_STORE);
  const n = st.getLastRow() - 1;
  if (n < 1) { ui.alert('지점마스터가 비어 있습니다. 먼저 [① 최초 설정 실행]을 눌러주세요.'); return; }

  st.getRange(1, 7).setValue('제출링크')
    .setFontWeight('bold').setBackground('#1428A0').setFontColor('#ffffff');

  const names = st.getRange(2, 1, n, 1).getValues();
  const links = names.map(function (r) {
    return [r[0] ? url + '?s=' + encodeURIComponent(r[0]) : ''];
  });
  st.getRange(2, 7, n, 1).setValues(links).setFontSize(9);
  st.setColumnWidth(7, 320);

  ui.alert('완료', '지점마스터 시트 G열에 지점별 전용 링크 ' + n + '개를 만들었습니다.\n\n' +
    '각 지점에 해당 줄의 링크를 보내주시면 지점이 자동 선택된 상태로 열립니다.',
    ui.ButtonSet.OK);
}


/** ============================================================
 *  웹앱 진입점
 *  ============================================================ */
function doGet(e) {
  const p = (e && e.parameter) || {};

  if (p.page === 'admin') {
    const pin = String(getSetting_('현황판PIN', ''));
    if (pin && String(p.k || '') !== pin) {
      return HtmlService.createHtmlOutput(
        '<div style="font-family:sans-serif;padding:40px;text-align:center;color:#666">접근 권한이 없습니다.</div>'
      );
    }
    const ta = HtmlService.createTemplateFromFile('admin');
    ta.items = CHECK_ITEMS;
    return ta.evaluate()
      .setTitle('VMD 현황 · 대구경북')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  const t = HtmlService.createTemplateFromFile('form');
  t.stores = getActiveStores_().map(function (s) { return s.name; });
  t.items = CHECK_ITEMS;
  t.preStore = p.s || '';
  t.maxSide = Number(getSetting_('사진최대크기', 1600)) || 1600;
  t.maxPhotos = CFG.MAX_PHOTOS;
  return t.evaluate()
    .setTitle('VMD 제출 · 대구경북')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}


/** ============================================================
 *  제출 처리 (폼 → 서버)
 *  ============================================================ */

/** 1단계: 제출 레코드 + 사진 폴더 생성 */
function createSubmission(meta) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lg = ss.getSheetByName(CFG.S_LOG);

    const store = String(meta.store || '').trim();
    if (!store) throw new Error('지점을 선택해주세요.');
    const region = storeRegion_(store);

    const shot = meta.shotDate ? new Date(meta.shotDate + 'T00:00:00+09:00') : new Date();
    const items = (meta.items || []).join(', ');
    const primary = ((meta.items || [])[0] || '기타').replace(/\s/g, '');

    // 드라이브 경로: VMD_대구경북 / 2026 / 07월 / 동대구 / 260727_신제품연출_1432
    const root = getRootFolder_();
    const yFolder = getOrCreateFolder_(root, Utilities.formatDate(shot, CFG.TZ, 'yyyy'));
    const mFolder = getOrCreateFolder_(yFolder, Utilities.formatDate(shot, CFG.TZ, 'MM') + '월');
    const sFolder = getOrCreateFolder_(mFolder, store);
    const stamp = Utilities.formatDate(new Date(), CFG.TZ, 'HHmm');
    const subName = Utilities.formatDate(shot, CFG.TZ, 'yyMMdd') + '_' + primary + '_' + stamp;
    const subFolder = sFolder.createFolder(subName);

    const ws = weekStart_(shot);
    const row = [
      new Date(),
      ws,
      weekLabel_(ws),
      store,
      region,
      String(meta.reporter || '').trim(),
      items,
      shot,
      0,
      '',
      subFolder.getId(),
      String(meta.note || '').trim(),
      '대기',
      ''
    ];
    lg.appendRow(row);
    const r = lg.getLastRow();
    lg.getRange(r, 2).setNumberFormat('yyyy-mm-dd');
    lg.getRange(r, 8).setNumberFormat('yyyy-mm-dd');
    lg.getRange(r, 1).setNumberFormat('yyyy-mm-dd hh:mm');
    lg.getRange(r, 10).setFormula(
      '=HYPERLINK("' + subFolder.getUrl() + '","📷 사진 보기")'
    );

    return {
      row: r,
      folderId: subFolder.getId(),
      prefix: Utilities.formatDate(shot, CFG.TZ, 'yyMMdd') + '_' + store + '_' + primary
    };
  } finally {
    lock.releaseLock();
  }
}

/** 2단계: 사진 1장씩 업로드 */
function addPhoto(folderId, prefix, index, file) {
  const folder = DriveApp.getFolderById(folderId);
  const ext = (file.mimeType === 'image/png') ? 'png' : 'jpg';
  const name = prefix + '_' + pad2_(index) + '.' + ext;
  const blob = Utilities.newBlob(Utilities.base64Decode(file.data), file.mimeType, name);
  const f = folder.createFile(blob);
  return f.getId();
}

/** 3단계: 마무리 — 사진 수 기록 + 주간현황 갱신 */
function finalizeSubmission(row, count) {
  const lg = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.S_LOG);
  lg.getRange(row, 9).setValue(count);
  try { refreshWeekSheet(); } catch (e) {}
  return true;
}


/** ============================================================
 *  주간현황 시트 갱신
 *  ============================================================ */
function refreshWeekSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = getOrCreateSheet_(ss, CFG.S_WEEK);
  const stores = getActiveStores_();
  const ws = weekStart_(new Date());
  const data = weekData_(ws);

  sh.clear();
  sh.getRange(1, 1).setValue('이번 주 제출 현황  (' + weekLabel_(ws) + ')')
    .setFontSize(13).setFontWeight('bold');

  const header = ['지점', '지역', '유형'].concat(CHECK_ITEMS).concat(['사진', '최종제출']);
  sh.getRange(3, 1, 1, header.length).setValues([header])
    .setFontWeight('bold').setBackground('#1428A0').setFontColor('#ffffff')
    .setHorizontalAlignment('center');

  const rows = stores.map(function (s) {
    const d = data[s.name];
    const line = [s.name, s.region, s.type];
    CHECK_ITEMS.forEach(function (it) { line.push(d && d.items[it] ? '●' : ''); });
    line.push(d ? d.photos : 0);
    line.push(d ? d.last : '');
    return line;
  });
  sh.getRange(4, 1, rows.length, header.length).setValues(rows);
  sh.getRange(4, 4, rows.length, CHECK_ITEMS.length)
    .setHorizontalAlignment('center').setFontColor('#1428A0').setFontSize(13);

  // 미제출 지점 행 강조
  rows.forEach(function (r, i) {
    const done = CHECK_ITEMS.some(function (it, j) { return r[3 + j] === '●'; });
    if (!done) sh.getRange(4 + i, 1, 1, header.length).setBackground('#FFF1F0');
  });

  const submitted = rows.filter(function (r) {
    return CHECK_ITEMS.some(function (it, j) { return r[3 + j] === '●'; });
  }).length;
  sh.getRange(1, 5).setValue('제출 ' + submitted + ' / ' + stores.length + '점  (' +
    Math.round(submitted / stores.length * 100) + '%)').setFontWeight('bold');

  sh.setFrozenRows(3);
  sh.setColumnWidth(1, 110);
  sh.autoResizeColumns(2, header.length - 1);
}


/** ============================================================
 *  미제출 알림
 *  ============================================================ */
function weeklyReminder() {
  const ws = weekStart_(new Date());
  const data = weekData_(ws);
  const stores = getActiveStores_();
  const missing = stores.filter(function (s) { return !data[s.name]; });

  const admin = getSetting_('관리자이메일', Session.getEffectiveUser().getEmail());
  var url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (e) {}

  const body =
    '[VMD 주간 제출 현황] ' + weekLabel_(ws) + '\n\n' +
    '제출 ' + (stores.length - missing.length) + ' / ' + stores.length + '점\n\n' +
    (missing.length
      ? '■ 미제출 지점 (' + missing.length + ')\n' + missing.map(function (s) {
          return ' · ' + s.name + (s.manager ? ' / ' + s.manager : '');
        }).join('\n')
      : '■ 전 지점 제출 완료') +
    '\n\n제출 링크: ' + url + '\n';

  if (admin) {
    MailApp.sendEmail(admin, '[VMD] ' + weekLabel_(ws) + ' 미제출 ' + missing.length + '점', body);
  }
  // 지점 담당자 개별 알림 (지점마스터에 이메일이 채워진 경우만)
  missing.forEach(function (s) {
    if (!s.email) return;
    MailApp.sendEmail(s.email,
      '[VMD] ' + s.name + ' 주간 제출 요청 (' + weekLabel_(ws) + ')',
      s.name + ' 담당자님,\n\n' + weekLabel_(ws) + ' 주차 VMD 제출이 아직 확인되지 않았습니다.\n' +
      '아래 링크에서 사진과 함께 제출 부탁드립니다.\n\n' + url + '\n');
  });

  refreshWeekSheet();
  return missing.length;
}

function sendReminderNow() {
  const n = weeklyReminder();
  SpreadsheetApp.getUi().alert('알림을 보냈습니다. 미제출 ' + n + '점');
}


/** ============================================================
 *  현황판(admin)용 조회 함수
 *  ============================================================ */
function listWeeks() {
  const lg = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.S_LOG);
  const out = [];
  const seen = {};
  if (lg.getLastRow() > 1) {
    lg.getRange(2, 2, lg.getLastRow() - 1, 1).getValues().forEach(function (r) {
      if (!r[0]) return;
      const k = Utilities.formatDate(new Date(r[0]), CFG.TZ, 'yyyy-MM-dd');
      if (!seen[k]) { seen[k] = 1; out.push(k); }
    });
  }
  const cur = Utilities.formatDate(weekStart_(new Date()), CFG.TZ, 'yyyy-MM-dd');
  if (!seen[cur]) out.push(cur);
  out.sort().reverse();
  return out.slice(0, 16).map(function (k) {
    return { key: k, label: weekLabel_(new Date(k + 'T00:00:00+09:00')) };
  });
}

function getBoard(weekKey) {
  const ws = new Date(weekKey + 'T00:00:00+09:00');
  const data = weekData_(ws);
  const stores = getActiveStores_();
  return {
    weekKey: weekKey,
    weekLabel: weekLabel_(ws),
    items: CHECK_ITEMS,
    total: stores.length,
    done: stores.filter(function (s) { return !!data[s.name]; }).length,
    stores: stores.map(function (s) {
      const d = data[s.name];
      return {
        name: s.name, region: s.region, type: s.type, manager: s.manager,
        submitted: !!d,
        items: d ? d.items : {},
        photos: d ? d.photos : 0,
        last: d ? d.last : '',
        subs: d ? d.subs : []
      };
    })
  };
}

function getPhotos(folderId) {
  const out = [];
  try {
    const it = DriveApp.getFolderById(folderId).getFiles();
    while (it.hasNext() && out.length < 30) {
      const f = it.next();
      var thumb = '';
      try {
        const b = f.getThumbnail();
        if (b) thumb = 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes());
      } catch (e) {}
      out.push({ name: f.getName(), url: f.getUrl(), thumb: thumb });
    }
  } catch (e) {}
  return out;
}


/** ============================================================
 *  내부 유틸
 *  ============================================================ */
function weekData_(ws) {
  const lg = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.S_LOG);
  const map = {};
  if (lg.getLastRow() < 2) return map;
  const key = Utilities.formatDate(ws, CFG.TZ, 'yyyy-MM-dd');
  const vals = lg.getRange(2, 1, lg.getLastRow() - 1, LOG_HEADERS.length).getValues();

  vals.forEach(function (v) {
    if (!v[1]) return;
    if (Utilities.formatDate(new Date(v[1]), CFG.TZ, 'yyyy-MM-dd') !== key) return;
    const store = v[3];
    if (!map[store]) map[store] = { items: {}, photos: 0, last: '', subs: [] };
    String(v[6] || '').split(',').forEach(function (it) {
      it = it.trim(); if (it) map[store].items[it] = true;
    });
    map[store].photos += Number(v[8] || 0);
    const ts = Utilities.formatDate(new Date(v[0]), CFG.TZ, 'MM/dd HH:mm');
    if (ts > map[store].last) map[store].last = ts;
    map[store].subs.push({
      at: ts,
      reporter: v[5],
      items: String(v[6] || ''),
      photos: Number(v[8] || 0),
      folderId: v[10],
      note: v[11],
      status: v[12]
    });
  });
  return map;
}

function getActiveStores_() {
  const st = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.S_STORE);
  if (!st || st.getLastRow() < 2) {
    return STORE_MASTER.map(function (s) {
      return { name: s[0], region: s[1], type: s[2], manager: '', email: '' };
    });
  }
  return st.getRange(2, 1, st.getLastRow() - 1, 6).getValues()
    .filter(function (r) { return r[0] && String(r[5]).toUpperCase() !== 'N'; })
    .map(function (r) {
      return { name: r[0], region: r[1], type: r[2], manager: r[3], email: r[4] };
    });
}

function storeRegion_(name) {
  const hit = getActiveStores_().filter(function (s) { return s.name === name; })[0];
  return hit ? hit.region : '';
}

function getSetting_(key, dflt) {
  const cf = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.S_SET);
  if (!cf || cf.getLastRow() < 2) return dflt;
  const v = cf.getRange(2, 1, cf.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < v.length; i++) if (v[i][0] === key) return v[i][1] || dflt;
  return dflt;
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

/** 루트 폴더 (설정을 안 돌렸거나 폴더가 삭제된 경우에도 안전하게 확보) */
function getRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ROOT_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) {}
  }
  const f = getOrCreateFolder_(DriveApp.getRootFolder(), CFG.ROOT_FOLDER_NAME);
  props.setProperty('ROOT_ID', f.getId());
  return f;
}

function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/** 월요일 기준 주 시작일 */
function weekStart_(d) {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (t.getDay() + 6) % 7; // 월=0
  t.setDate(t.getDate() - dow);
  return t;
}

function weekLabel_(ws) {
  const we = new Date(ws); we.setDate(we.getDate() + 6);
  return Utilities.formatDate(ws, CFG.TZ, 'M/d') + '~' + Utilities.formatDate(we, CFG.TZ, 'M/d');
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }
