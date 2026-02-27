'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const fs   = require('fs');
const path = require('path');
const https = require('https');

// ── 설정 ──────────────────────────────────────────────
const APIKEY          = process.env.APIKEY;
const CSV_PATH        = path.resolve(__dirname, process.env.API_LIST ?? './api_list.csv');
const SALS_STTS_CD    = process.env.SALS_STTS_CD ?? null;  // 없으면 필터 미적용
const OUTPUT_ROOT  = path.join(__dirname, 'output');
const NUM_OF_ROWS  = 100;
const DELAY_API    = 500;    // API 간 대기 (ms)
const DELAY_PAGE   = 200;    // 페이지 간 대기 (ms)
const DELAY_429    = 60000;  // rate limit 시 대기 (ms)
const MAX_RETRY    = 3;
// ──────────────────────────────────────────────────────

// CLI 인자 검증  (--limit N 옵션으로 테스트용 제한 가능)
const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const [from, to] = args.filter(a => !a.startsWith('--') && !/^\d+$/.test(a) || /^\d{8}$/.test(a)).slice(0, 2);
if (!from || !to || !/^\d{8}$/.test(from) || !/^\d{8}$/.test(to)) {
  console.error('사용법: node collect.js <시작일YYYYMMDD> <종료일YYYYMMDD>');
  console.error('  예시: node collect.js 20250101 20250201');
  console.error('  주의: 종료일은 미포함(LT) — 20250201이면 1월 말까지');
  process.exit(1);
}

function parseDate(s) {
  const y = +s.slice(0, 4), m = +s.slice(4, 6) - 1, d = +s.slice(6, 8);
  const dt = new Date(y, m, d);
  return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d ? dt : null;
}
const dateFrom = parseDate(from);
const dateTo   = parseDate(to);
if (!dateFrom) { console.error(`오류: 유효하지 않은 시작일 — ${from}`); process.exit(1); }
if (!dateTo)   { console.error(`오류: 유효하지 않은 종료일 — ${to}`);   process.exit(1); }
if (dateFrom >= dateTo) {
  console.error(`오류: 시작일(${from})은 종료일(${to})보다 작아야 합니다. (같은 날짜 불가)`);
  process.exit(1);
}
if (!APIKEY) {
  console.error('.env 에 APIKEY가 없습니다.');
  process.exit(1);
}

// ── CSV 파서 ──────────────────────────────────────────
function parseCSVLine(line) {
  const values = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { values.push(cur); cur = ''; }
    else { cur += ch; }
  }
  values.push(cur);
  return values;
}

function parseCSV(content) {
  const lines = content.trim().split(/\r?\n/);
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const vals = parseCSVLine(line);
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
    });
}

// ── HTTP ──────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
  });
}

// ── 페이지 단건 요청 ──────────────────────────────────
async function fetchPage(baseUrl, page) {
  const url =
    `https://${baseUrl}/info` +
    `?serviceKey=${APIKEY}` +
    `&pageNo=${page}` +
    `&numOfRows=${NUM_OF_ROWS}` +
    `&cond[LAST_MDFCN_PNT::GTE]=${from}000000` +
    `&cond[LAST_MDFCN_PNT::LT]=${to}000000` +
    (SALS_STTS_CD ? `&cond[SALS_STTS_CD::EQ]=${SALS_STTS_CD}` : '') +
    `&returnType=json`;

  for (let retry = 0; retry < MAX_RETRY; retry++) {
    try {
      const { status, body } = await httpGet(url);

      if (status === 429) {
        console.log(`    429 rate limit — ${DELAY_429 / 1000}초 대기...`);
        await sleep(DELAY_429);
        continue;
      }
      if (status !== 200) throw new Error(`HTTP ${status}`);

      const json = JSON.parse(body);
      const result = json?.response?.body;
      if (!result) throw new Error('응답 형식 오류');
      return result;
    } catch (err) {
      console.log(`    오류: ${err.message} — 재시도 ${retry + 1}/${MAX_RETRY}`);
      if (retry < MAX_RETRY - 1) await sleep(2000);
    }
  }
  return null;
}

// items.item 은 결과 수에 따라 undefined / 객체 / 배열이 될 수 있음
function normalizeItems(items) {
  if (!items?.item) return [];
  return Array.isArray(items.item) ? items.item : [items.item];
}

// ── API 1개 수집 ──────────────────────────────────────
async function collectApi(api, saveDir, log) {
  const slug     = api['Base URL'].split('/').pop();
  const savePath = path.join(saveDir, `${slug}.json`);

  if (fs.existsSync(savePath)) {
    log(`  [스킵] ${api['API Name']}`);
    return;
  }

  log(`  [수집] ${api['API Name']}`);

  const first = await fetchPage(api['Base URL'], 1);
  if (!first) {
    log(`    -> 실패`);
    return;
  }

  const totalCount = parseInt(first.totalCount, 10) || 0;
  const allItems   = normalizeItems(first.items);
  log(`    totalCount: ${totalCount}`);

  if (totalCount > NUM_OF_ROWS) {
    const totalPages = Math.ceil(totalCount / NUM_OF_ROWS);
    for (let page = 2; page <= totalPages; page++) {
      await sleep(DELAY_PAGE);
      const result = await fetchPage(api['Base URL'], page);
      if (result) allItems.push(...normalizeItems(result.items));
    }
  }

  const output = {
    apiName: api['API Name'],
    slug,
    from,
    to,
    totalCount,
    collectedCount: allItems.length,
    items: allItems,
  };
  fs.writeFileSync(savePath, JSON.stringify(output, null, 2));
  log(`    -> 저장 완료: ${allItems.length}건`);
}

// ── 메인 ─────────────────────────────────────────────
async function main() {
  const saveDir = path.join(OUTPUT_ROOT, `${from}_${to}`);
  fs.mkdirSync(saveDir, { recursive: true });

  const logPath = path.join(saveDir, '_collect.log');
  const log = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.appendFileSync(logPath, line + '\n');
  };

  const apis = parseCSV(fs.readFileSync(CSV_PATH, 'utf-8'));
  const targets = isFinite(LIMIT) ? apis.slice(0, LIMIT) : apis;
  log(`=== 수집 시작: ${from} ~ ${to} (${targets.length}개 API${isFinite(LIMIT) ? ` / 전체 ${apis.length}개 중 ${LIMIT}개만` : ''}) ===`);

  let success = 0, fail = 0, skip = 0;

  for (let i = 0; i < targets.length; i++) {
    log(`[${i + 1}/${targets.length}]`);
    const before = fs.readdirSync(saveDir).filter(f => f.endsWith('.json')).length;
    await collectApi(targets[i], saveDir, log);
    const after  = fs.readdirSync(saveDir).filter(f => f.endsWith('.json')).length;

    if (after > before) success++;
    else {
      const slug = targets[i]['Base URL'].split('/').pop();
      if (fs.existsSync(path.join(saveDir, `${slug}.json`))) skip++;
      else fail++;
    }

    if (i < targets.length - 1) await sleep(DELAY_API);
  }

  log('');
  log(`=== 완료 === 성공: ${success}개 | 실패: ${fail}개 | 스킵: ${skip}개`);
  log(`저장 위치: ${saveDir}`);
}

main().catch(err => {
  console.error('치명적 오류:', err);
  process.exit(1);
});
