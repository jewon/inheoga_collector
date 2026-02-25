'use strict';

const fs   = require('fs');
const path = require('path');

// ── 공통 컬럼 정의 ────────────────────────────────────
const COMMON_COLUMNS = [
  'API_NM',           // (추가) 업종명
  'MNG_NO',           // 관리번호
  'OPN_ATMY_GRP_CD',  // 개방자치단체코드
  'BPLC_NM',          // 사업장명
  'BZSTAT_SE_NM',     // 업태구분명
  'SALS_STTS_CD',     // 영업상태코드
  'SALS_STTS_NM',     // 영업상태명
  'DTL_SALS_STTS_CD', // 상세영업상태코드
  'DTL_SALS_STTS_NM', // 상세영업상태명
  'LCPMT_YMD',        // 인허가일자
  'CLSBIZ_YMD',       // 폐업일자
  'ROAD_NM_ADDR',     // 도로명주소
  'LOTNO_ADDR',       // 지번주소
  'ROAD_NM_ZIP',      // 도로명우편번호
  'LCTN_ZIP',         // 소재지우편번호
  'LCTN_AREA',        // 소재지면적
  'TELNO',            // 전화번호
  'CRD_INFO_X',       // 좌표(X)
  'CRD_INFO_Y',       // 좌표(Y)
  'DAT_UPDT_SE',      // 데이터갱신구분
  'DAT_UPDT_PNT',     // 데이터갱신시점
  'LAST_MDFCN_PNT',   // 최종수정시점
];

function csvEscape(val) {
  const str = val == null ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function main() {
  const [rangeDir] = process.argv.slice(2);
  if (!rangeDir) {
    console.error('사용법: node merge.js <날짜범위폴더명>');
    console.error('  예시: node merge.js 20250101_20250201');
    process.exit(1);
  }

  const inputDir = path.join(__dirname, 'output', rangeDir);
  if (!fs.existsSync(inputDir)) {
    console.error(`폴더 없음: ${inputDir}`);
    process.exit(1);
  }

  const jsonFiles = fs.readdirSync(inputDir)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'));

  if (jsonFiles.length === 0) {
    console.error('병합할 JSON 파일이 없습니다. collect.js 를 먼저 실행하세요.');
    process.exit(1);
  }

  console.log(`JSON 파일 ${jsonFiles.length}개 병합 중...`);

  const outPath = path.join(inputDir, 'merged.csv');
  const ws = fs.createWriteStream(outPath, { encoding: 'utf8' });

  // Excel 한글 깨짐 방지용 BOM
  ws.write('\uFEFF');
  ws.write(COMMON_COLUMNS.join(',') + '\n');

  let totalRows = 0;
  let emptyApis = 0;

  for (const file of jsonFiles) {
    const json    = JSON.parse(fs.readFileSync(path.join(inputDir, file), 'utf-8'));
    const apiName = json.apiName ?? '';
    const items   = json.items ?? [];

    if (items.length === 0) { emptyApis++; continue; }

    for (const item of items) {
      const row = COMMON_COLUMNS.map(col =>
        col === 'API_NM' ? csvEscape(apiName) : csvEscape(item[col])
      );
      ws.write(row.join(',') + '\n');
      totalRows++;
    }
  }

  ws.end();
  console.log(`완료: 총 ${totalRows}건`);
  console.log(`결과 없는 업종: ${emptyApis}개`);
  console.log(`저장: ${outPath}`);
}

main();
