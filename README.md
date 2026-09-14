# 업무 배정표

누적 이력을 반영해 5명의 작업자에게 5개 업무를 자동 배정하는 웹 앱입니다.

## 주요 기능

- 볼분리 / 볼분리 보조 제한 규칙 적용
- 김·탁·임의 볼분리 균등을 최우선으로 한 월간 최적화
- 박·류의 업무 제한 반영
- 최근 6개월 상세 이력 + 이전 기간 baseline 누적
- 연차 관리 및 달력 표시
- 작업자/업무 표시명 변경
- JSON 백업·복원
- GitHub `data/history.json` 불러오기 및 저장 준비
- 배정표 출력 / 달력 출력
- 다크모드
- Web Worker 기반 자동 배정 계산 및 실패 시 메인 스레드 fallback

## 구조

```text
├─ index.html
├─ style.css
├─ data/
│  └─ history.json
├─ scripts/
│  └─ prune-history.mjs
├─ package.json
└─ js/
   ├─ app.js
   ├─ config.js
   ├─ state.js
   ├─ data.js
   ├─ utils.js
   ├─ assignment.js
   ├─ leave.js
   ├─ calendar.js
   ├─ render.js
   ├─ backup.js
   ├─ github.js
   ├─ settings.js
   ├─ theme.js
   ├─ print.js
   └─ optimize-worker.js
```

## GitHub Pages

`index.html`은 `js/app.js`를 ES Module로 불러옵니다. GitHub Pages에서 그대로 배포할 수 있습니다.

## 데이터

실제 작업 이력은 브라우저의 localStorage와 `data/history.json` 백업을 함께 사용할 수 있습니다.

GitHub 기능을 사용할 때는 저장소의 공개 `history.json`을 읽으며, 브라우저에서 직접 GitHub 파일에 쓰지 않고 JSON을 복사해 GitHub 편집 화면에서 커밋하는 방식입니다.

## 기록 정리

Node.js 환경에서는 다음 명령으로 6개월보다 오래된 상세 기록을 `baseline`으로 압축할 수 있습니다.

```bash
npm run prune-history
```
