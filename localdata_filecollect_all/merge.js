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
const TARGET_COLS = [
  '업종명',            // 파일명에서 추출 (추가 컬럼)
  '개방자치단체코드',
  '관리번호',
  '인허가일자',
  '인허가취소일자',
  '영업상태명',
  '영업상태코드',
  '상세영업상태명',
  '상세영업상태코드',
  '폐업일자',
  '휴업시작일자',
  '휴업종료일자',
  '소재지우편번호',
  '도로명우편번호',
  '사업장명',
  '업태구분명',
  '데이터갱신구분',
  '데이터갱신시점',
  '도로명주소',
  '지번주소',
  '전화번호',
  '좌표정보(X)',
  '좌표정보(Y)',
  '최종수정시점',
];
// ──────────────────────────────────────────────────────────────

function escapeField(val) {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
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

function processFileStreaming(fpath, categoryName, outStream) {
  return new Promise((resolve, reject) => {
    const decoder = iconv.getDecoder('euc-kr');
    const input = fs.createReadStream(fpath);

    // iconv-lite 스트리밍 디코딩
    const decodeStream = iconv.decodeStream('euc-kr');
    const rl = readline.createInterface({ input: input.pipe(decodeStream), crlfDelay: Infinity });

    let header = null;
    let colIdx = {};
    let fileRows = 0;

    rl.on('line', (line) => {
      if (!line.trim()) return;

      if (!header) {
        // 첫 줄 = 헤더
        header = parseLine(line);
        header.forEach((h, i) => { colIdx[h.trim()] = i; });
        return;
      }

      const fields = parseLine(line);
      const out = TARGET_COLS.map(col => {
        if (col === '업종명') return escapeField(categoryName);
        const idx = colIdx[col];
        return idx !== undefined ? escapeField(fields[idx]) : '';
      });
      outStream.write(iconv.encode(out.join(',') + '\r\n', 'euc-kr'));
      fileRows++;
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
