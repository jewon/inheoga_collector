# inheoga_collector
인허가 API의 공공 데이터 포털 이전에 대응하기 위한 툴 모음

- **환경**:
  - **Node.js**: 18 이상
  - **Dependencies**: 
	  ```
	  npm install
	  npx playwright install chromium
	  ```

## 유틸리티 목록

### 1. 인허가정보 API 자동 신청툴 (`automate_api`)
공공데이터포털의 API 활용 신청을 자동으로 수행하는 도구입니다.


- **주요 기능**:
  - `api_urls.txt` 파일에 적힌 URL 목록을 읽어 순차적으로 신청 페이지 접속
  - `.config` 파일에서 신청 정보 작성 가능 (공공데이터포털 참조)
  - Puppeteer를 사용한 브라우저 자동화
  - 이미 신청된 내역은 건너뛰고 새로운 신청만 처리 (스크립트 로직에 따라 다름)

- **사용 방법**:
  1. `automate_api/api_urls.txt` 파일에 신청할 API 상세 페이지 URL들을 한 줄에 하나씩 입력합니다. (기존 내용은 인허가 관련 195개 API입니다.)
  2. 해당 디렉토리에서 스크립트를 실행합니다:
     ```bash
     node automate_api.js
     ```
  3. 열리는 크롬 브라우저에서 로그인을 하면, 앱이 자동으로 감지하여 신청을 시작합니다.
     
---

### 2. 인허가정보 전국 파일 수집기 (`localdata_collect_all`)

공공데이터포털(file.localdata.go.kr)에서 인허가정보 195개 업종의 전국 CSV 파일을 자동 수집하고 1개로 통합하는 도구입니다.

- **주요 기능**:
  - 인허가정보 195개 업종을 순서대로 다운로드
  - `downloads/YYYY-MM-DD/` 폴더에 날짜별로 저장
  - 이미 받은 파일은 자동 스킵 → 중단 후 재실행 가능
  - 20개마다 브라우저 재시작 (메모리 누수 방지)
  - 각 CSV에서 지정된 공통 컬럼만 추출해 1개 파일로 병합

- **merge.js 추출 컬럼** (23개, 고정): `_merge.csv`
  `업종명`(파일명 기반 자동 생성), `개방자치단체코드`, `관리번호`, `인허가일자`, `인허가취소일자`,
  `영업상태명`, `영업상태코드`, `상세영업상태명`, `상세영업상태코드`, `폐업일자`,
  `휴업시작일자`, `휴업종료일자`, `소재지우편번호`, `도로명우편번호`, `사업장명`,
  `업태구분명`, `데이터갱신구분`, `데이터갱신시점`, `도로명주소`, `지번주소`,
  `전화번호`, `좌표정보(X)`, `좌표정보(Y)`, `최종수정시점`
  > 각 CSV 헤더에서 해당 컬럼을 찾아 값을 추출하며, 없는 컬럼은 빈 값으로 채웁니다.

- **사용 방법**:
  1. 해당 디렉토리에서 다운로드를 실행합니다:
     ```bash
     node download_all.js
     ```
  2. 다운로드 완료 후 통합 파일을 생성합니다:
     ```bash
     node merge.js           # 가장 최신 날짜 폴더 자동 선택
     node merge.js 2026-02-25  # 날짜 지정
     ```

- **출력 파일**:
  - 개별 파일: `downloads/YYYY-MM-DD/*.csv` (EUC-KR, 업종별 원본 컬럼)
  - 통합 파일: `downloads/YYYY-MM-DD/_merged.csv` (EUC-KR, 공통 컬럼 추출)
  

- **참고**:
  - 데이터 출처: [공공데이터포털 - 행정안전부 인허가정보](https://www.data.go.kr/data/15045025/fileData.do)
  - 다운로드 간격: 3초 (서버 부하 방지)
  - 속도 제한(429) 발생 시 60초 대기 후 자동 재시도

---

### 3. 인허가정보 API 수집기 (`localdata_apicollect`)

공공데이터포털 인허가정보 API 195개를 통해 **최종수정일자 범위**를 지정하여 데이터를 수집하고 병합하는 도구입니다.

- **`.env` 설정** (`localdata_apicollect/.env`):
  ```env
  APIKEY=<공공데이터포털 인증키>
  API_LIST=./api_list.csv       # API 목록 파일 경로
  SALS_STTS_CD=01               # 영업상태 필터 (01=영업/정상). 없으면 전체 수집
  ```

- **주요 기능**:
  - 195개 API를 순차 호출하여 최종수정일자(`LAST_MDFCN_PNT`) 범위의 데이터 수집
  - 100건 페이지 제한 자동 처리 (전 페이지 순회)
  - API별 결과를 JSON으로 저장 → 중단 후 재실행 시 이어서 진행
  - 병합 시 JSON 삭제 (기본값), `--keep` 옵션으로 유지 가능
  - 날짜 유효성 검증 (존재하지 않는 날짜, 역순, 동일 날짜 오류 처리)

- **사용 방법**:

  **① 수집 + 병합 한번에** (권장):
  ```bash
  node localdata_apicollect/main.js <시작일> <종료일>
  node localdata_apicollect/main.js 20260119 20260126
  ```

  **② 수집 / 병합 개별 실행**:
  ```bash
  node localdata_apicollect/collect.js 20260119 20260126
  node localdata_apicollect/merge.js 20260119_20260126          # 병합 후 JSON 삭제
  node localdata_apicollect/merge.js 20260119_20260126 --keep   # JSON 유지
  ```

  **③ 일부만 테스트** (`--limit N`):
  ```bash
  node localdata_apicollect/collect.js 20260119 20260126 --limit 5
  ```

- **날짜 주의사항**:
  - 종료일은 미포함(LT) — 1월 25일까지 수집하려면 `to=20260126`
  - 시작일 = 종료일이거나 시작일 > 종료일이면 오류

- **출력 파일**:
  ```
  localdata_apicollect/output/20260119_20260126/
    merged.csv                           ← 공통 컬럼 (UTF-8 BOM, Excel용)
    result_all_20260119_20260126.txt     ← 전체 결과 (EUC-KR, | 구분 / 구 Localdata API 결과물 호환용)
    result_coordmapping_20260119_20260126.txt  ← 사업장명+도로명주소 (EUC-KR, | 구분 / 구 Localdata API 결과물 호환용)
    _collect.log                         ← 수집 로그
  ```

- **merged.csv 컬럼** (22개):
  `API_NM`, `MNG_NO`, `OPN_ATMY_GRP_CD`, `BPLC_NM`, `BZSTAT_SE_NM`,
  `SALS_STTS_CD`, `SALS_STTS_NM`, `DTL_SALS_STTS_CD`, `DTL_SALS_STTS_NM`,
  `LCPMT_YMD`, `CLSBIZ_YMD`, `ROAD_NM_ADDR`, `LOTNO_ADDR`, `ROAD_NM_ZIP`,
  `LCTN_ZIP`, `LCTN_AREA`, `TELNO`, `CRD_INFO_X`, `CRD_INFO_Y`,
  `DAT_UPDT_SE`, `DAT_UPDT_PNT`, `LAST_MDFCN_PNT`

- **result_all 컬럼** (14개):
  `번호`, `인허가번호`, `서비스ID`, `데이터갱신일자`, `서비스ID명`, `사업장명`,
  `지번주소`, `도로명주소`, `인허가일자`, `좌표정보(X)`, `좌표정보(Y)`,
  `최종수정일자`, `업태구분명`, `전화번호`

- **참고**:
  - 속도 제한(429) 발생 시 60초 대기 후 자동 재시도
  - API 목록: `localdata_apicollect/api_list.csv` (195개 업종)

---
