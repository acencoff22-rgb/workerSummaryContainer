# 업무 배정표

5명의 작업자에게 5개 업무를 자동 배정하고, 이전 누적 이력을 반영해 업무별 편차를 줄이는 웹 앱입니다.

## 주요 기능

- 볼분리 / 볼분리 보조: 김·탁·임만 배정
- 박: 설거지 및 성형보조 / 분쇄 및 성형보조만 배정
- 류: 설거지 및 성형보조 / 분쇄 및 성형보조 / 성형 및 분쇄보조만 배정
- 볼분리 균등을 최우선으로 한 월간 배정
- 볼분리 보조 균등
- 김·탁·임의 하위 업무별 누적 편차 최소화
- 박의 설거지/분쇄 균형
- 류의 3개 업무 균형
- 최근 6개월 상세 이력 + 이전 기간 baseline 누적
- 연차 관리 및 달력
- 작업자/업무 표시명 변경
- JSON 백업/복원
- GitHub `data/history.json` 불러오기 및 저장 준비
- 배정표 출력 / 달력 출력
- 다크모드
- Web Worker 자동 배정 + 실패/시간초과 시 fallback

## 구조

```text
├─ index.html
├─ style.css
├─ data/
│  └─ history.json
├─ scripts/
│  ├─ verify.mjs
│  └─ prune-history.mjs
├─ package.json
└─ js/
   ├─ app.js
   ├─ config.js
   ├─ state.js
   ├─ data.js
   ├─ utils.js
   ├─ assignment.js
   ├─ calendar.js
   ├─ leave.js
   ├─ render.js
   ├─ backup.js
   ├─ github.js
   ├─ settings.js
   ├─ theme.js
   ├─ print.js
   └─ optimize-worker.js
```

## 배정 방식

배정은 단순한 무작위 순열 선택이 아니라 월간 목표량을 먼저 계산한 뒤 날짜별 완전 매칭으로 분해합니다.

우선순위는 다음과 같습니다.

1. 김·탁·임의 볼분리 균등
2. 김·탁·임의 볼분리 보조 균등
3. 김·탁·임의 설거지/분쇄/성형 누적 편차 최소화
4. 박의 설거지/분쇄 균형
5. 류의 3개 업무 균형
6. 날짜별 동일업무 연속 최소화

박은 다른 업무를 맡을 수 없고 류도 허용된 세 업무만 맡기 때문에 일부 월에서는 각 업무의 절대적 균등이 불가능합니다. 이 경우 가능한 범위에서 편차를 최소화합니다.

## GitHub Pages

`index.html`은 `js/app.js`를 ES Module로 불러오므로 GitHub Pages에 그대로 배포할 수 있습니다.

## 데이터

현재 데이터는 브라우저 localStorage와 `data/history.json` 백업으로 관리할 수 있습니다.

GitHub 불러오기는 공개된 `history.json`을 읽습니다. 저장은 브라우저가 GitHub API에 직접 쓰지 않고 JSON을 복사해 GitHub 편집 화면에서 커밋하는 방식입니다.

이전 형식에서 월별 `history[YYYY-MM].leave`에만 저장된 연차도 로드 시 현재 top-level `leave` 형식으로 병합합니다.

## 기록 정리

```bash
npm run prune-history
```

최근 6개월보다 오래된 상세 기록은 `baseline`으로 압축합니다.

## 검증

```bash
npm run verify
```

기본적인 월간 배정 범위와 규칙, 누적 데이터 계산을 자동으로 검사합니다.
