"use strict";

/*
 * 업무 배정표 자동 생성기
 *
 * 현재 확정 규칙
 *
 * 1. 하루 5개 업무는 각각 정확히 1번씩 배정
 * 2. 한 작업자는 하루에 1개 업무만 담당
 * 3. 볼분리 -> 김 / 탁 / 임
 * 4. 볼분리 보조 -> 김 / 탁 / 임
 * 5. 류 -> 나머지 3개 업무 모두 가능
 * 6. 박 -> 설거지 및 성형보조 / 분쇄 및 성형보조만 가능
 * 7. 김·탁·임의 볼분리 횟수 균형을 최우선
 * 8. 그 다음 볼분리 보조 균형
 * 9. 그 다음 전체 업무량 균형
 * 10. 류의 3개 업무 균형
 * 11. 같은 업무의 연속 배정은 가능한 한 줄임
 *
 * 주의
 * ---------------------------------------------
 * 박의 "성형 및 분쇄보조" 교환 규칙은
 * 이후 실제 운용 규칙을 확정한 뒤 별도의
 * 교환 단계로 넣을 수 있도록 구조를 분리한다.
 */

const WORKERS = [
  "김",
  "탁",
  "임",
  "박",
  "류",
];

const JOBS = [
  "볼분리",
  "볼분리 보조",
  "설거지 및 성형보조",
  "분쇄 및 성형보조",
  "성형 및 분쇄보조",
];

const BOWL_WORKERS = [
  "김",
  "탁",
  "임",
];

const LIU_JOBS = [
  "설거지 및 성형보조",
  "분쇄 및 성형보조",
  "성형 및 분쇄보조",
];

const PARK_ALLOWED_JOBS = [
  "설거지 및 성형보조",
  "분쇄 및 성형보조",
];

let currentSchedule = [];
let copiedText = "";

/* =========================================================
 * 기본 유틸리티
 * ======================================================= */

function createEmptyWorkerCounts() {
  const result = {};

  for (const worker of WORKERS) {
    result[worker] = {};

    for (const job of JOBS) {
      result[worker][job] = 0;
    }
  }

  return result;
}

function createEmptyJobCounts() {
  const result = {};

  for (const job of JOBS) {
    result[job] = 0;
  }

  return result;
}

function shuffle(array) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(
      Math.random() * (i + 1),
    );

    [
      result[i],
      result[randomIndex],
    ] = [
      result[randomIndex],
      result[i],
    ];
  }

  return result;
}

function getWeekdayName(weekday) {
  const names = [
    "일",
    "월",
    "화",
    "수",
    "목",
    "금",
    "토",
  ];

  return names[weekday];
}

function getDateInfo(year, month, day) {
  const date = new Date(
    year,
    month - 1,
    day,
  );

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    weekday: date.getDay(),
  };
}

/* =========================================================
 * 업무 가능 여부
 * ======================================================= */

function isAllowed(worker, job) {
  /*
   * 볼분리 계열
   */
  if (
    job === "볼분리" ||
    job === "볼분리 보조"
  ) {
    return BOWL_WORKERS.includes(worker);
  }

  /*
   * 박
   */
  if (worker === "박") {
    return PARK_ALLOWED_JOBS.includes(job);
  }

  /*
   * 류
   */
  if (worker === "류") {
    return LIU_JOBS.includes(job);
  }

  /*
   * 김 / 탁 / 임은 나머지 업무 가능
   */
  return true;
}

/* =========================================================
 * 배열 순열 생성
 * ======================================================= */

function generatePermutations(items) {
  if (items.length <= 1) {
    return [items.slice()];
  }

  const result = [];

  for (let i = 0; i < items.length; i += 1) {
    const current = items[i];

    const remaining = [
      ...items.slice(0, i),
      ...items.slice(i + 1),
    ];

    const permutations =
      generatePermutations(remaining);

    for (const permutation of permutations) {
      result.push([
        current,
        ...permutation,
      ]);
    }
  }

  return result;
}

/* =========================================================
 * 하루 전체 후보 생성
 *
 * 핵심:
 * 업무 5개와 작업자 5명의 모든 1:1 대응을 만든 뒤
 * 규칙에 맞지 않는 후보를 제거한다.
 *
 * 5! = 120가지이므로 브라우저에서 충분히 처리 가능하다.
 * ======================================================= */

function generateDailyCandidates() {
  const candidates = [];

  const workerPermutations =
    generatePermutations(
      WORKERS,
    );

  for (const workerOrder of workerPermutations) {
    const candidate = {};

    let valid = true;

    for (let i = 0; i < JOBS.length; i += 1) {
      const job = JOBS[i];
      const worker = workerOrder[i];

      if (!isAllowed(worker, job)) {
        valid = false;
        break;
      }

      candidate[job] = worker;
    }

    if (!valid) {
      continue;
    }

    /*
     * 모든 업무가 정확히 한 번씩 들어갔고
     * 작업자도 정확히 한 명씩 사용됐는지 확인
     */
    const usedWorkers = JOBS.map(
      (job) => candidate[job],
    );

    if (
      new Set(usedWorkers).size !== WORKERS.length
    ) {
      continue;
    }

    candidates.push(candidate);
  }

  return candidates;
}

/* =========================================================
 * 이전 누적 횟수 계산
 * ======================================================= */

function calculateCounts(schedule) {
  const workerCounts =
    createEmptyWorkerCounts();

  const jobCounts =
    createEmptyJobCounts();

  for (const day of schedule) {
    for (const job of JOBS) {
      const worker = day[job];

      if (!worker) {
        continue;
      }

      workerCounts[worker][job] += 1;
      jobCounts[job] += 1;
    }
  }

  return {
    workerCounts,
    jobCounts,
  };
}

/* =========================================================
 * 류 업무 편중 점수
 * ======================================================= */

function calculateLiuBalancePenalty(
  workerCounts,
  candidate,
) {
  const counts = [];

  for (const job of LIU_JOBS) {
    let count =
      workerCounts["류"][job];

    if (candidate[job] === "류") {
      count += 1;
    }

    counts.push(count);
  }

  const max = Math.max(...counts);
  const min = Math.min(...counts);

  return max - min;
}

/* =========================================================
 * 김·탁·임 볼분리 균형
 *
 * 최우선 조건
 * ======================================================= */

function calculateBowlPenalty(
  workerCounts,
  candidate,
) {
  const counts = BOWL_WORKERS.map(
    (worker) => {
      let count =
        workerCounts[worker]["볼분리"];

      if (candidate["볼분리"] === worker) {
        count += 1;
      }

      return count;
    },
  );

  const max = Math.max(...counts);
  const min = Math.min(...counts);

  return max - min;
}

/* =========================================================
 * 김·탁·임 볼분리 보조 균형
 * ======================================================= */

function calculateBowlHelperPenalty(
  workerCounts,
  candidate,
) {
  const counts =
    BOWL_WORKERS.map(
      (worker) => {
        let count =
          workerCounts[worker]["볼분리 보조"];

        if (
          candidate["볼분리 보조"] === worker
        ) {
          count += 1;
        }

        return count;
      },
    );

  const max = Math.max(...counts);
  const min = Math.min(...counts);

  return max - min;
}

/* =========================================================
 * 김·탁·임 전체 업무량 균형
 * ======================================================= */

function calculateMainWorkerTotalPenalty(
  workerCounts,
  candidate,
) {
  const totals =
    BOWL_WORKERS.map(
      (worker) => {
        let total = 0;

        for (const job of JOBS) {
          total +=
            workerCounts[worker][job];

          if (
            candidate[job] === worker
          ) {
            total += 1;
          }
        }

        return total;
      },
    );

  const max = Math.max(...totals);
  const min = Math.min(...totals);

  return max - min;
}

/* =========================================================
 * 전체 작업자 업무량 균형
 * ======================================================= */

function calculateAllWorkerTotalPenalty(
  workerCounts,
  candidate,
) {
  const totals =
    WORKERS.map(
      (worker) => {
        let total = 0;

        for (const job of JOBS) {
          total +=
            workerCounts[worker][job];

          if (
            candidate[job] === worker
          ) {
            total += 1;
          }
        }

        return total;
      },
    );

  const max = Math.max(...totals);
  const min = Math.min(...totals);

  return max - min;
}

/* =========================================================
 * 같은 업무 연속 배정 패널티
 * ======================================================= */

function calculateConsecutivePenalty(
  schedule,
  candidate,
) {
  if (schedule.length === 0) {
    return 0;
  }

  const previous =
    schedule[schedule.length - 1];

  let penalty = 0;

  for (const worker of WORKERS) {
    const previousJob =
      getJobForWorker(
        previous,
        worker,
      );

    const currentJob =
      getJobForWorker(
        candidate,
        worker,
      );

    if (
      previousJob &&
      previousJob === currentJob
    ) {
      penalty += 1;
    }
  }

  return penalty;
}

/* =========================================================
 * 전체 후보 점수
 *
 * 점수가 낮을수록 좋음
 *
 * 1순위: 볼분리
 * 2순위: 볼분리 보조
 * 3순위: 김·탁·임 업무량
 * 4순위: 류 업무 균형
 * 5순위: 전체 업무량
 * 6순위: 연속 업무
 * ======================================================= */

function calculateCandidateScore(
  schedule,
  candidate,
) {
  const {
    workerCounts,
  } = calculateCounts(
    schedule,
  );

  const bowlPenalty =
    calculateBowlPenalty(
      workerCounts,
      candidate,
    );

  const helperPenalty =
    calculateBowlHelperPenalty(
      workerCounts,
      candidate,
    );

  const mainWorkerPenalty =
    calculateMainWorkerTotalPenalty(
      workerCounts,
      candidate,
    );

  const liuPenalty =
    calculateLiuBalancePenalty(
      workerCounts,
      candidate,
    );

  const allWorkerPenalty =
    calculateAllWorkerTotalPenalty(
      workerCounts,
      candidate,
    );

  const consecutivePenalty =
    calculateConsecutivePenalty(
      schedule,
      candidate,
    );

  /*
   * 가중치는 우선순위를 명확하게 구분하기 위해
   * 충분한 차이를 둔다.
   */
  return (
    bowlPenalty * 1000000 +
    helperPenalty * 100000 +
    mainWorkerPenalty * 10000 +
    liuPenalty * 1000 +
    allWorkerPenalty * 100 +
    consecutivePenalty
  );
}

/* =========================================================
 * 하루 최적 배정 선택
 * ======================================================= */

function chooseBestDailyAssignment(
  schedule,
) {
  const candidates =
    generateDailyCandidates();

  if (candidates.length === 0) {
    throw new Error(
      "현재 설정된 업무 규칙으로 가능한 하루 배정을 찾을 수 없습니다.",
    );
  }

  let bestScore = Infinity;
  let bestCandidates = [];

  for (const candidate of shuffle(candidates)) {
    const score =
      calculateCandidateScore(
        schedule,
        candidate,
      );

    if (score < bestScore) {
      bestScore = score;
      bestCandidates = [
        candidate,
      ];
    } else if (score === bestScore) {
      bestCandidates.push(candidate);
    }
  }

  return bestCandidates[
    Math.floor(
      Math.random() *
        bestCandidates.length,
    )
  ];
}

/* =========================================================
 * 월간 배정 생성
 * ======================================================= */

function generateSchedule(
  year,
  month,
  startDay,
  endDay,
) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(startDay) ||
    !Number.isInteger(endDay)
  ) {
    throw new Error(
      "연도, 월, 시작일, 종료일을 확인해주세요.",
    );
  }

  if (
    month < 1 ||
    month > 12
  ) {
    throw new Error(
      "월은 1~12 사이여야 합니다.",
    );
  }

  const daysInMonth =
    new Date(
      year,
      month,
      0,
    ).getDate();

  if (
    startDay < 1 ||
    startDay > daysInMonth
  ) {
    throw new Error(
      "시작일이 해당 월의 범위를 벗어났습니다.",
    );
  }

  if (
    endDay < 1 ||
    endDay > daysInMonth
  ) {
    throw new Error(
      "종료일이 해당 월의 범위를 벗어났습니다.",
    );
  }

  if (startDay > endDay) {
    throw new Error(
      "시작일은 종료일보다 클 수 없습니다.",
    );
  }

  const schedule = [];

  for (
    let day = startDay;
    day <= endDay;
    day += 1
  ) {
    const dateInfo =
      getDateInfo(
        year,
        month,
        day,
      );

    const assignment =
      chooseBestDailyAssignment(
        schedule,
      );

    schedule.push({
      ...dateInfo,
      ...assignment,
    });
  }

  return schedule;
}

/* =========================================================
 * 배정표 검증
 * ======================================================= */

function validateSchedule(schedule) {
  const errors = [];

  for (const day of schedule) {
    /*
     * 5개 업무 모두 존재하는지
     */
    for (const job of JOBS) {
      if (!day[job]) {
        errors.push(
          `${day.month}월 ${day.day}일: ${job} 미배정`,
        );
      }
    }

    /*
     * 작업자가 중복되지 않는지
     */
    const workers =
      JOBS.map(
        (job) => day[job],
      ).filter(Boolean);

    if (
      new Set(workers).size !== 5
    ) {
      errors.push(
        `${day.month}월 ${day.day}일: 작업자 중복 배정`,
      );
    }

    /*
     * 각 업무의 허용 작업자 확인
     */
    for (const job of JOBS) {
      const worker = day[job];

      if (!worker) {
        continue;
      }

      if (!isAllowed(worker, job)) {
        errors.push(
          `${day.month}월 ${day.day}일: ${worker}에게 ${job} 배정 불가`,
        );
      }
    }
  }

  return errors;
}

/* =========================================================
 * 텍스트 변환
 * ======================================================= */

function getJobForWorker(
  day,
  worker,
) {
  for (const job of JOBS) {
    if (day[job] === worker) {
      return job;
    }
  }

  return null;
}

function formatScheduleAsText(
  schedule,
) {
  if (schedule.length === 0) {
    return "";
  }

  const firstDay =
    schedule[0];

  const lines = [];

  lines.push(
    `${firstDay.year}년 ${firstDay.month}월 업무 배정표`,
  );

  lines.push("");

  for (const day of schedule) {
    lines.push(
      `### ${day.month}월 ${day.day}일`,
    );

    lines.push(
      `김 → ${getJobForWorker(day, "김") || "미배정"}`,
    );

    lines.push(
      `탁 → ${getJobForWorker(day, "탁") || "미배정"}`,
    );

    lines.push(
      `임 → ${getJobForWorker(day, "임") || "미배정"}`,
    );

    lines.push(
      `박 → ${getJobForWorker(day, "박") || "미배정"}`,
    );

    lines.push(
      `류 → ${getJobForWorker(day, "류") || "미배정"}`,
    );

    lines.push("");
  }

  return lines.join("\n");
}

/* =========================================================
 * 요약 계산
 * ======================================================= */

function calculateSummary(schedule) {
  const {
    workerCounts,
    jobCounts,
  } = calculateCounts(
    schedule,
  );

  return {
    workerCounts,
    jobCounts,
  };
}

/* =========================================================
 * 업무별 요약 화면
 * ======================================================= */

function renderJobSummary() {
  const container =
    document.getElementById(
      "summaryContainer",
    );

  if (!container) {
    return;
  }

  const {
    jobCounts,
  } = calculateSummary(
    currentSchedule,
  );

  container.innerHTML = "";

  for (const job of JOBS) {
    const card =
      document.createElement(
        "div",
      );

    card.className =
      "summary-card";

    const label =
      document.createElement(
        "span",
      );

    label.className = "label";
    label.textContent = job;

    const value =
      document.createElement(
        "span",
      );

    value.className = "value";
    value.textContent =
      `${jobCounts[job]}회`;

    card.appendChild(label);
    card.appendChild(value);

    container.appendChild(card);
  }
}

/* =========================================================
 * 작업자별 요약 화면
 * ======================================================= */

function renderWorkerSummary() {
  const container =
    document.getElementById(
      "workerSummaryContainer",
    );

  if (!container) {
    return;
  }

  const {
    workerCounts,
  } = calculateSummary(
    currentSchedule,
  );

  const wrapper =
    document.createElement(
      "div",
    );

  wrapper.className =
    "worker-table-wrap";

  const table =
    document.createElement(
      "table",
    );

  table.className =
    "worker-table";

  const thead =
    document.createElement(
      "thead",
    );

  const headerRow =
    document.createElement(
      "tr",
    );

  const headers = [
    "작업자",
    "볼분리",
    "볼분리 보조",
    "설거지",
    "분쇄",
    "성형",
    "총합",
  ];

  for (const header of headers) {
    const th =
      document.createElement(
        "th",
      );

    th.textContent = header;
    headerRow.appendChild(th);
  }

  thead.appendChild(
    headerRow,
  );

  const tbody =
    document.createElement(
      "tbody",
    );

  for (const worker of WORKERS) {
    const row =
      document.createElement(
        "tr",
      );

    let total = 0;

    for (const job of JOBS) {
      total +=
        workerCounts[worker][job];
    }

    const values = [
      worker,
      workerCounts[worker]["볼분리"],
      workerCounts[worker]["볼분리 보조"],
      workerCounts[worker]["설거지 및 성형보조"],
      workerCounts[worker]["분쇄 및 성형보조"],
      workerCounts[worker]["성형 및 분쇄보조"],
      total,
    ];

    for (
      let i = 0;
      i < values.length;
      i += 1
    ) {
      const td =
        document.createElement(
          "td",
        );

      if (i === values.length - 1) {
        const strong =
          document.createElement(
            "strong",
          );

        strong.textContent =
          String(values[i]);

        td.appendChild(strong);
      } else {
        td.textContent =
          String(values[i]);
      }

      row.appendChild(td);
    }

    tbody.appendChild(row);
  }

  table.appendChild(thead);
  table.appendChild(tbody);

  wrapper.appendChild(table);

  container.innerHTML = "";
  container.appendChild(wrapper);
}

/* =========================================================
 * 결과 화면
 * ======================================================= */

function renderSchedule() {
  const resultElement =
    document.getElementById(
      "resultText",
    );

  const statusElement =
    document.getElementById(
      "statusText",
    );

  if (!resultElement) {
    return;
  }

  const errors =
    validateSchedule(
      currentSchedule,
    );

  copiedText =
    formatScheduleAsText(
      currentSchedule,
    );

  resultElement.textContent =
    copiedText;

  if (statusElement) {
    if (errors.length === 0) {
      statusElement.textContent =
        `${currentSchedule.length}일 생성 완료 · 규칙 검증 통과`;
    } else {
      statusElement.textContent =
        `검증 오류 ${errors.length}건`;
    }
  }

  if (errors.length > 0) {
    resultElement.textContent +=
      "\n\n[검증 오류]\n" +
      errors.join("\n");
  }

  renderJobSummary();
  renderWorkerSummary();
}

/* =========================================================
 * 자동 배정 버튼
 * ======================================================= */

function handleGenerate() {
  const year =
    Number(
      document.getElementById(
        "yearInput",
      ).value,
    );

  const month =
    Number(
      document.getElementById(
        "monthInput",
      ).value,
    );

  const startDay =
    Number(
      document.getElementById(
        "startDayInput",
      ).value,
    );

  const endDay =
    Number(
      document.getElementById(
        "endDayInput",
      ).value,
    );

  try {
    currentSchedule =
      generateSchedule(
        year,
        month,
        startDay,
        endDay,
      );

    renderSchedule();
  } catch (error) {
    console.error(
      error,
    );

    alert(
      error instanceof Error
        ? error.message
        : "배정표 생성 중 오류가 발생했습니다.",
    );
  }
}

/* =========================================================
 * 텍스트 복사
 * ======================================================= */

async function handleCopy() {
  if (!copiedText) {
    alert(
      "먼저 배정표를 생성해주세요.",
    );

    return;
  }

  try {
    await navigator.clipboard.writeText(
      copiedText,
    );

    alert(
      "배정표가 클립보드에 복사되었습니다.",
    );
  } catch (error) {
    /*
     * 오래된 브라우저 대응
     */
    const textarea =
      document.createElement(
        "textarea",
      );

    textarea.value =
      copiedText;

    textarea.style.position =
      "fixed";

    textarea.style.left =
      "-9999px";

    document.body.appendChild(
      textarea,
    );

    textarea.focus();
    textarea.select();

    try {
      document.execCommand(
        "copy",
      );

      alert(
        "배정표가 복사되었습니다.",
      );
    } catch (copyError) {
      console.error(
        copyError,
      );

      alert(
        "복사에 실패했습니다. 결과 내용을 직접 선택해 복사해주세요.",
      );
    }

    textarea.remove();
  }
}

/* =========================================================
 * 테마
 * ======================================================= */

function updateThemeButton() {
  const button =
    document.getElementById(
      "themeToggle",
    );

  if (!button) {
    return;
  }

  const isDark =
    document.body.classList.contains(
      "dark",
    );

  button.textContent =
    isDark
      ? "라이트모드"
      : "다크모드";
}

function restoreTheme() {
  const savedTheme =
    localStorage.getItem(
      "assignment-app-theme",
    );

  if (savedTheme === "dark") {
    document.body.classList.add(
      "dark",
    );
  }

  updateThemeButton();
}

function handleThemeToggle() {
  document.body.classList.toggle(
    "dark",
  );

  const isDark =
    document.body.classList.contains(
      "dark",
    );

  localStorage.setItem(
    "assignment-app-theme",
    isDark
      ? "dark"
      : "light",
  );

  updateThemeButton();
}

/* =========================================================
 * 초기화
 * ======================================================= */

function initializeApp() {
  restoreTheme();

  const generateButton =
    document.getElementById(
      "generateButton",
    );

  if (generateButton) {
    generateButton.addEventListener(
      "click",
      handleGenerate,
    );
  }

  const copyButton =
    document.getElementById(
      "copyButton",
    );

  if (copyButton) {
    copyButton.addEventListener(
      "click",
      handleCopy,
    );
  }

  const themeToggle =
    document.getElementById(
      "themeToggle",
    );

  if (themeToggle) {
    themeToggle.addEventListener(
      "click",
      handleThemeToggle,
    );
  }
}

document.addEventListener(
  "DOMContentLoaded",
  initializeApp,
);
