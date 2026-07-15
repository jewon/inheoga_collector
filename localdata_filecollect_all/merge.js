/**
 * 인허가정보 CSV 195개 → 1개 통합 파일 생성
 * - 입력: downloads/{날짜}/*.csv  (EUC-KR)
 * - 출력: downloads/{날짜}/_merged.csv (EUC-KR)
 * - 공통 컬럼만 추출, 없는 컬럼은 빈 값
 * - 업종명 컬럼 추가 (파일명 기반)
 *
 * 사용법: node merge.js [날짜폴더]
 *   예)   node merge.js 2026-02-25
 *         node merge.js          ← 가장 최신 날짜 폴더 자동 선택
 */

const fs   = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const readline = require('readline');

// ── 추출할 컬럼 목록 (순서 = 출력 컬럼 순서) ──────────────────
// '번호'는 업종별 순번으로 코드에서 자동 생성
// '개방서비스아이디'는 원본에 없으므로 빈 값
// '재개업일자','소재지면적'은 일부 파일에만 존재 (없으면 빈 값)
const TARGET_COLS = [
  '번호',              // 업종별 순번 (코드에서 생성)
  '업종명',            // 파일명에서 추출 (추가 컬럼)
  '개방서비스아이디',  // 빈 컬럼
  '개방자치단체코드',
  '관리번호',
  '인허가일자',
  '인허가취소일자',
  '영업상태구분코드',
  '영업상태명',
  '상세영업상태코드',
  '상세영업상태명',
  '폐업일자',
  '휴업시작일자',
  '휴업종료일자',
  '재개업일자',
  '전화번호',
  '소재지면적',
  '소재지우편번호',
  '지번주소',
  '도로명주소',
  '도로명우편번호',
  '사업장명',
  '최종수정시점',
  '데이터갱신구분',
  '데이터갱신시점',
  '업태구분명',
  '좌표정보(X)',
  '좌표정보(Y)',
];
// ──────────────────────────────────────────────────────────────

function escapeField(val) {
  if (val == null) return '';
  // 줄바꿈(\r\n, \n, \r)을 공백으로 치환
  const s = String(val).replace(/\r\n|\r|\n/g, ' ');
  if (s.includes(',') || s.includes('"')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function parseLine(line) {
  const fields = [];
  let cur = '', inQ = false;
  for (let c = 0; c < line.length; c++) {
    if (line[c] === '"') {
      inQ = !inQ;
    } else if (line[c] === ',' && !inQ) {
      fields.push(cur);
      cur = '';
    } else {
      cur += line[c];
    }
  }
  fields.push(cur);
  return fields;
}

// 원본 CSV의 컬럼명이 TARGET_COLS과 다를 수 있는 경우 매핑
const COL_ALIASES = {
  '영업상태구분코드': '영업상태코드',  // 원본에서는 '영업상태코드'
};

function processFileStreaming(fpath, categoryName, outStream) {
  return new Promise((resolve, reject) => {
    const input = fs.createReadStream(fpath);

    // iconv-lite 스트리밍 디코딩
    const decodeStream = iconv.decodeStream('euc-kr');
    const rl = readline.createInterface({ input: input.pipe(decodeStream), crlfDelay: Infinity });

    let header = null;
    let colIdx = {};
    let fileRows = 0;
    let lineBuf = '';  // 멀티라인 필드 버퍼

    rl.on('line', (rawLine) => {
      // 따옴표가 열린 채 줄이 끝나면 다음 줄과 이어붙이기
      lineBuf = lineBuf ? lineBuf + '\n' + rawLine : rawLine;

      // 따옴표 개수가 홀수이면 아직 닫히지 않은 필드가 있음
      const quoteCount = (lineBuf.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) return; // 다음 줄 대기

      const line = lineBuf;
      lineBuf = '';

      if (!line.trim()) return;

      if (!header) {
        // 첫 줄 = 헤더
        header = parseLine(line);
        header.forEach((h, i) => { colIdx[h.trim()] = i; });
        return;
      }

      fileRows++;
      const fields = parseLine(line);
      const out = TARGET_COLS.map(col => {
        if (col === '번호') return escapeField(fileRows);
        if (col === '업종명') return escapeField(categoryName);
        if (col === '개방서비스아이디') return '';
        // 별칭 매핑: TARGET_COLS 이름으로 먼저 찾고, 없으면 alias로 시도
        let idx = colIdx[col];
        if (idx === undefined && COL_ALIASES[col]) idx = colIdx[COL_ALIASES[col]];
        return idx !== undefined ? escapeField(fields[idx]) : '';
      });
      outStream.write(iconv.encode(out.join(',') + '\r\n', 'euc-kr'));
    });

    rl.on('close', () => resolve(fileRows));
    rl.on('error', reject);
    input.on('error', reject);
  });
}

async function main() {
  const outputRoot = path.join(__dirname, 'downloads');
  let dateDir = process.argv[2];

  if (!dateDir) {
    const dirs = fs.readdirSync(outputRoot)
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
    if (!dirs.length) { console.error('downloads 폴더에 날짜 디렉토리 없음'); process.exit(1); }
    dateDir = dirs[dirs.length - 1];
  }

  const srcDir  = path.join(outputRoot, dateDir);
  const outPath = path.join(srcDir, '_merged.csv');
  const logPath = path.join(srcDir, '_merge.log');

  const log = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.appendFileSync(logPath, line + '\n');
  };

  log(`=== 병합 시작: ${dateDir} ===`);

  const csvFiles = fs.readdirSync(srcDir)
    .filter(f => f.endsWith('.csv') && !f.startsWith('_'))
    .sort();
  log(`대상 파일: ${csvFiles.length}개`);

  const outStream = fs.createWriteStream(outPath, { encoding: 'binary' });

  // 헤더 출력
  const headerLine = TARGET_COLS.map(escapeField).join(',') + '\r\n';
  outStream.write(iconv.encode(headerLine, 'euc-kr'));

  let totalRows = 0;

  for (const fname of csvFiles) {
    const categoryName = fname.replace('.csv', '');
    const fpath = path.join(srcDir, fname);

    try {
      const fileRows = await processFileStreaming(fpath, categoryName, outStream);
      totalRows += fileRows;
      log(`  ${fname}: ${fileRows.toLocaleString()}행`);
    } catch (err) {
      log(`  [오류] ${fname}: ${err.message}`);
    }
  }

  await new Promise(r => outStream.end(r));

  const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
  log('');
  log(`=== 완료 ===`);
  log(`총 ${totalRows.toLocaleString()}행 → ${outPath}`);
  log(`파일 크기: ${sizeMB} MB`);
}

main().catch(err => { console.error(err); process.exit(1); });
