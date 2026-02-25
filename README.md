# Small Utils

이 레포지토리는 개발 과정에서 반복적으로 수행되는 작은 작업들을 자동화하기 위한 유틸리티 모음입니다.

## 유틸리티 목록

### 1. 인허가정보 API 자동 신청툴 (`automate_api`)
공공데이터포털의 API 활용 신청을 자동으로 수행하는 도구입니다.

- **환경**:
  - **Node.js**: v14 이상 권장
  - **Dependencies**: `npm install puppeteer`

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

### 2. 인허가정보 전국 파일 수집기 (`localdata_collect`)

공공데이터포털(file.localdata.go.kr)에서 인허가정보 195개 업종의 전국 CSV 파일을 자동 수집하고 1개로 통합하는 도구입니다.

- **환경**:
  - **Node.js**: 권장
  - **Dependencies**: `npm install`

- **주요 기능**:
  - 인허가정보 195개 업종을 순서대로 다운로드
  - `downloads/YYYY-MM-DD/` 폴더에 날짜별로 저장
  - 이미 받은 파일은 자동 스킵 → 중단 후 재실행 가능
  - 20개마다 브라우저 재시작 (메모리 누수 방지)
  - 각 CSV에서 공통 컬럼만 추출해 1개 파일로 병합

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

- **주기 실행** (Windows 작업 스케줄러):
  ```bat
  @echo off
  cd /d C:\claude_area\localdata_collect
  node download_all.js
  node merge.js
  ```

- **참고**:
  - 데이터 출처: [공공데이터포털 - 행정안전부 인허가정보](https://www.data.go.kr/data/15045025/fileData.do)
  - 다운로드 간격: 3초 (서버 부하 방지)
  - 속도 제한(429) 발생 시 60초 대기 후 자동 재시도

---

### 3. 인허가정보 API 수집기 (`localdata_apicollect`)

공공데이터포털 인허가정보 API 195개를 통해 **인허가일자 범위**를 지정하여 데이터를 수집하고 1개 CSV로 병합하는 도구입니다.

- **환경**:
  - **Node.js**: v18 이상
  - **Dependencies**: `npm install`
  - **API 키**: `localdata_apicollect/.env` 에 `APIKEY=<인증키>` 설정

- **주요 기능**:
  - 195개 API를 순차 호출하여 지정한 인허가일자 범위의 데이터 수집
  - 100건 페이지 제한을 자동으로 처리 (전 페이지 순회)
  - API별 결과를 JSON으로 저장 → 중단 후 재실행 시 이어서 진행
  - 수집 완료 후 공통 컬럼만 추출해 1개 CSV로 병합

- **사용 방법**:

  **① 수집 + 병합 한번에** (권장):
  ```bash
  node localdata_apicollect/main.js <시작일> <종료일>
  # 예시 (종료일은 미포함)
  node localdata_apicollect/main.js 20250101 20250201
  ```

  **② 수집 / 병합 개별 실행**:
  ```bash
  node localdata_apicollect/collect.js 20250101 20250201
  node localdata_apicollect/merge.js 20250101_20250201
  ```

  **③ 일부만 테스트** (`--limit N`):
  ```bash
  node localdata_apicollect/collect.js 20250101 20250201 --limit 5
  ```

- **출력 파일**:
  ```
  localdata_apicollect/output/20250101_20250201/
    hospitals.json                  ← API별 수집 결과 (raw)
    group_meal_food_retailers.json
    ...                             ← 195개
    merged.csv                      ← 공통 컬럼 병합 결과 (UTF-8 BOM)
    _collect.log                    ← 수집 로그
  ```

- **병합 CSV 컬럼** (22개):
  `API_NM`, `MNG_NO`, `OPN_ATMY_GRP_CD`, `BPLC_NM`, `BZSTAT_SE_NM`,
  `SALS_STTS_CD`, `SALS_STTS_NM`, `DTL_SALS_STTS_CD`, `DTL_SALS_STTS_NM`,
  `LCPMT_YMD`, `CLSBIZ_YMD`, `ROAD_NM_ADDR`, `LOTNO_ADDR`, `ROAD_NM_ZIP`,
  `LCTN_ZIP`, `LCTN_AREA`, `TELNO`, `CRD_INFO_X`, `CRD_INFO_Y`,
  `DAT_UPDT_SE`, `DAT_UPDT_PNT`, `LAST_MDFCN_PNT`

- **참고**:
  - 종료일은 미포함(LT) — 1월 데이터 수집 시 `to=20250201` 로 지정
  - 속도 제한(429) 발생 시 60초 대기 후 자동 재시도
  - API 목록: `인허가API리스트.csv` (195개 업종)

---
