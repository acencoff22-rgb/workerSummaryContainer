"use strict";

/*
 * 업무 배정표 자동 생성기
 *
 * 핵심 규칙
 * 1. 하루 5개 업무는 각각 한 번씩 배정
 * 2. 볼분리 -> 김/탁/임만
 * 3. 볼분리 보조 -> 김/탁/임만
 * 4. 박 -> 설거지 및 성형보조 / 분쇄 및 성형보조
 * 5. 류는 나머지 3개 업무를 순환
 * 6. 박에게 성형 및 분쇄보조가 발생하면
 *    박과 분쇄 및 성형보조 담당자를 교환
 * 7. 김/탁/임의 볼분리 횟수 균등을 가장 높은 우선순위로 적용
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

const EXTRA_JOB_FOR_LIU = [
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

/* -------------------------------------------
 * 유틸리티
 * ----------------------------------------- */

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

function cloneAssignment(assignment) {
  return {
    ...assignment,
  };
}

function shuffle(array) {
  const copied = [...array];

  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));

    [
      copied[i],
      copied[j],
    ] = [
      copied[j],
      copied[i],
    ];
  }

  return copied;
}

function normalizeDateParts(year, month, day) {
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

/* -------------------------------------------
 * 기본 규칙 검증
 * ----------------------------------------- */

function isAllowed(worker, job) {
  if (
    job === "볼분리" ||
    job === "볼분리 보조"
  ) {
    return BOWL_WORKERS.includes(worker);
  }

  if (worker === "박") {
    return PARK_ALLOWED_JOBS.includes(job);
  }

  if (worker === "류") {
    return EXTRA_JOB_FOR_LIU.includes(job);
  }

  return true;
}

/* -------------------------------------------
 * 점수 계산
 * 낮을수록 좋은 배정
 * ----------------------------------------- */

function calculateScore(
  schedule,
  candidate,
) {
  const workerCounts = createEmptyWorkerCounts();
  const jobCounts = createEmptyJobCounts();

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

  const nextWorkerCounts = createEmptyWorkerCounts();
  const nextJobCounts = {
    ...jobCounts,
  };

  for (const job of JOBS) {
    const worker = candidate[job];

    if (!worker) {
      continue;
    }

    nextWorkerCounts[worker][job] += 1;
    nextJobCounts[job] += 1;
  }

  /*
   * 1순위: 김·탁·임의 볼분리 균형
   */
  const bowlCounts = BOWL_WORKERS.map(
    (worker) =>
      workerCounts[worker]["볼분리"] +
      (candidate["볼분리"] === worker ? 1 : 0),
  );

  const bowlMax = Math.max(...bowlCounts);
  const bowlMin = Math.min(...bowlCounts);

  let score = 0;

  score += (bowlMax - bowlMin) * 100000;

  /*
   * 2순위: 김·탁·임의 볼분리 보조 균형
   */
  const bowlHelperCounts = BOWL_WORKERS.map(
    (worker) =>
      workerCounts[worker]["볼분리 보조"] +
      (candidate["볼분리 보조"] === worker ? 1 : 0),
  );

  const helperMax = Math.max(
    ...bowlHelperCounts,
  );

  const helperMin = Math.min(
    ...bowlHelperCounts,
  );

  score += (helperMax - helperMin) * 10000;

  /*
   * 3순위: 김·탁·임 전체 업무량 균형
   */
  const workerTotalCounts =
    BOWL_WORKERS.map((worker) => {
      let total = 0;

      for (const job of JOBS) {
        total +=
          workerCounts[worker][job];

        if (candidate[job] === worker) {
          total += 1;
        }
      }

      return total;
    });

  const workerTotalMax = Math.max(
    ...workerTotalCounts,
  );

  const workerTotalMin = Math.min(
    ...workerTotalCounts,
  );

  score +=
    (workerTotalMax - workerTotalMin) * 1000;

  /*
   * 4순위: 류의 세 업무 균형
   */
  const liuCounts =
    EXTRA_JOB_FOR_LIU.map((job) => {
      return (
        workerCounts["류"][job] +
        (candidate[job] === "류" ? 1 : 0)
      );
    });

  const liuMax = Math.max(...liuCounts);
  const liuMin = Math.min(...liuCounts);

  score += (liuMax - liuMin) * 500;

  /*
   * 5순위: 전체 업무량 균형
   *
   * 한 사람에게 일이 지나치게 몰리는 것을 방지
   */
  const allWorkerTotals = WORKERS.map(
    (worker) => {
      let total = 0;

      for (const job of JOBS) {
        total += workerCounts[worker][job];

        if (candidate[job] === worker) {
          total += 1;
        }
      }

      return total;
    },
  );

  const allMax = Math.max(
    ...allWorkerTotals,
  );

  const allMin = Math.min(
    ...allWorkerTotals,
  );

  score +=
    (allMax - allMin) * 50;

  /*
   * 6순위: 같은 업무 연속 완화
   */
  const previous = schedule.length > 0
    ? schedule[schedule.length - 1]
    : null;

  if (previous) {
    for (const job of JOBS) {
      if (
        previous[job] === candidate[job]
      ) {
        score += 5;
      }
    }
  }

  return score;
}

/* -------------------------------------------
 * 하루 후보 생성
 * ----------------------------------------- */

function generateDailyCandidates() {
  const candidates = [];

  for (
    const bowlWorker of shuffle(BOWL_WORKERS)
  ) {
    const remainingBowlWorkers =
      BOWL_WORKERS.filter(
        (worker) => worker !== bowlWorker,
      );

    for (
      const bowlHelper of shuffle(
        remainingBowlWorkers,
      )
    ) {
      const candidatePool = [
        bowlWorker,
        bowlHelper,
      ];

      const remainingWorkers =
        WORKERS.filter(
          (worker) =>
            !candidatePool.includes(worker),
        );

      const remainingJobs = [
        "설거지 및 성형보조",
        "분쇄 및 성형보조",
        "성형 및 분쇄보조",
      ];

      /*
       * 류는 반드시 세 업무 중 하나를 담당.
       *
       * 박은 두 업무만 가능하므로
       * 실제 조합을 만든 뒤 박 교환 규칙을 적용한다.
       */
      for (
        const liuJob of shuffle(
          remainingJobs,
        )
      ) {
        const candidate = {
          "볼분리": bowlWorker,
          "볼분리 보조": bowlHelper,
        };

        candidate[liuJob] = "류";

        const parkJobs =
          remainingJobs.filter(
            (job) => job !== liuJob,
          );

        for (
          const parkJob of shuffle(parkJobs)
        ) {
          const otherJob =
            parkJobs.find(
              (job) => job !== parkJob,
            );

          const remainingTwoWorkers =
            remainingWorkers.filter(
              (worker) => worker !== "류",
            );

          if (
            remainingTwoWorkers.length !== 2
          ) {
            continue;
          }

          const candidateCopy = {
            ...candidate,
          };

          candidateCopy[parkJob] = "박";

          candidateCopy[otherJob] =
            remainingTwoWorkers.find(
              (worker) =>
                worker !== "박" &&
                worker !== "류",
            );

          /*
           * 박이 허용되지 않는 업무를 맡았으면
           * 분쇄 업무 담당자와 교환한다.
           */
          if (
            !isAllowed(
              "박",
              candidateCopy[parkJob],
            )
          ) {
            continue;
          }

          let valid = true;

          for (const job of JOBS) {
            const worker = candidateCopy[job];

            if (!worker) {
              valid = false;
              break;
            }

            if (!isAllowed(worker, job)) {
              valid = false;
              break;
            }
          }

          if (!valid) {
            continue;
          }

          /*
           * 모든 작업자가 정확히 한 업무씩 맡는지 확인
           */
          const workersUsed = JOBS.map(
            (job) => candidateCopy[job],
          );

          const uniqueWorkers =
            new Set(workersUsed);

          if (
            uniqueWorkers.size !== 5
          ) {
            continue;
          }

          candidates.push(candidateCopy);
        }
      }
    }
  }

  /*
   * 위 방식만으로는 박 교환이 필요한 경우를
   * 표현하기 어려우므로 추가 순열 후보도 만든다.
   */
  return candidates;
}

/* -------------------------------------------
 * 박 교환 규칙
 *
 * 박이 성형 및 분쇄보조를 맡게 되는 경우
 * 박의 업무를 분쇄 및 성형보조로,
 * 분쇄 및 성형보조 담당자를
 * 성형 및 분쇄보조로 변경한다.
 * ----------------------------------------- */

function applyParkSwap(candidate) {
  const result = cloneAssignment(candidate);

  if (
    result["성형 및 분쇄보조"] !== "박"
  ) {
    return result;
  }

  const grinderWorker =
    result["분쇄 및 성형보조"];

  if (!grinderWorker) {
    return result;
  }

  result["분쇄 및 성형보조"] = "박";
  result["성형 및 분쇄보조"] =
    grinderWorker;

  /*
   * 실제 의미상 박의 원래 업무는
   * 분쇄 및 성형보조가 되어야 하고,
   * 해당 업무 담당자는 성형 및 분쇄보조로
   * 이동한다.
   */
  return result;
}

/* -------------------------------------------
 * 하루 하나의 최적 후보 선택
 * ----------------------------------------- */

function chooseBestDailyAssignment(
  schedule,
) {
  let candidates =
    generateDailyCandidates();

  candidates = candidates.map(
    applyParkSwap,
  );

  candidates = candidates.filter(
    (candidate) => {
      const workers =
        JOBS.map((job) => candidate[job]);

      return (
        workers.every(Boolean) &&
        new Set(workers).size === 5
      );
    },
  );

  if (candidates.length === 0) {
    throw new Error(
      "현재 규칙으로 유효한 하루 배정을 만들 수 없습니다.",
    );
  }

  let bestScore = Infinity;
  let bestCandidates = [];

  for (const candidate of candidates) {
    const score =
      calculateScore(
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

  const selected =
    bestCandidates[
      Math.floor(
        Math.random() *
          bestCandidates.length,
      )
    ];

  return selected;
}

/* -------------------------------------------
 * 월간 배정
 * ----------------------------------------- */

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
      "날짜 입력값을 확인해주세요.",
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
    endDay > daysInMonth ||
    startDay > endDay
  ) {
    throw new Error(
      `${year}년 ${month}월의 날짜 범위를 확인해주세요.`,
    );
  }

  const schedule = [];

  for (
    let day = startDay;
    day <= endDay;
    day += 1
  ) {
    const dateInfo =
      normalizeDateParts(
        year,
        month,
        day,
      );

    const assignment =
      chooseBestDailyAssignment(
        schedule,
      );

    schedule.push({
      year: dateInfo.year,
      month: dateInfo.month,
      day: dateInfo.day,
      weekday: dateInfo.weekday,
      ...assignment,
    });
  }

  return schedule;
}

/* -------------------------------------------
 * 검증
 * ----------------------------------------- */

function validateSchedule(schedule) {
  const errors = [];

  for (const day of schedule) {
    const workers = JOBS.map(
      (job) => day[job],
    );

    if (
      workers.some(
        (worker) => !worker,
      )
    ) {
      errors.push(
        `${day.day}일: 미배정 업무가 있습니다.`,
      );
      continue;
    }

    if (
      new Set(workers).size !== 5
    ) {
      errors.push(
        `${day.day}일: 한 사람이 두 업무를 맡았습니다.`,
      );
    }

    for (const job of JOBS) {
      const worker = day[job];

      if (!isAllowed(worker, job)) {
        errors.push(
          `${day.day}일: ${worker}에게 ${job} 배정 불가`,
        );
      }
    }
  }

  return errors;
}

/* -------------------------------------------
 * 횟수 계산
 * ----------------------------------------- */

function calculateSummary(schedule) {
  const jobCounts =
    createEmptyJobCounts();

  const workerCounts =
    createEmptyWorkerCounts();

  for (const day of schedule) {
    for (const job of JOBS) {
      const worker = day[job];

      if (!worker) {
        continue;
      }

      jobCounts[job] += 1;
      workerCounts[worker][job] += 1;
    }
  }

  return {
    jobCounts,
    workerCounts,
  };
}

/* -------------------------------------------
 * 텍스트 출력
 * ----------------------------------------- */

function formatScheduleAsText(
  schedule,
) {
  const lines = [];

  lines.push(
    `${schedule[0].year}년 ${schedule[0].month}월 업무 배정표`,
  );
  lines.push("");

  for (const day of schedule) {
    lines.push(
      `### ${day.month}월 ${day.day}일 (${getWeekdayName(day.weekday)})`,
    );

    lines.push(
      `김 → ${getJobForWorker(day, "김")}`,
    );

    lines.push(
      `탁 → ${getJobForWorker(day, "탁")}`,
    );

    lines.push(
      `임 → ${getJobForWorker(day, "임")}`,
    );

    lines.push(
      `박 → ${getJobForWorker(day, "박")}`,
    );

    lines.push(
      `류 → ${getJobForWorker(day, "류")}`,
    );

    lines.push("");
  }

  return lines.join("\n");
}

function getJobForWorker(
  day,
  worker,
) {
  for (const job of JOBS) {
    if (day[job] === worker) {
      return job;
    }
  }

  return "미배정";
}

/* -------------------------------------------
 * 화면 렌더링
 * ----------------------------------------- */

function renderSchedule() {
  const resultElement =
    document.getElementById(
      "resultText",
    );

  const statusElement =
    document.getElementById(
      "statusText",
    );

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

  if (errors.length === 0) {
    statusElement.textContent =
      `${currentSchedule.length}일 배정 완료 · 규칙 검증 통과`;
  } else {
    statusElement.textContent =
      `검증 오류 ${errors.length}건`;
    resultElement.textContent +=
      `\n\n[검증 오류]\n${errors.join("\n")}`;
  }

  renderJobSummary();
  renderWorkerSummary();
}

function renderJobSummary() {
  const container =
    document.getElementById(
      "summaryContainer",
    );

  const summary =
    calculateSummary(
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

    card.innerHTML = `
      <span class="label">
        ${escapeHtml(job)}
      </span>
      <span class="value">
        ${summary.jobCounts[job]}회
      </span>
    `;

    container.appendChild(card);
  }
}

function renderWorkerSummary() {
  const container =
    document.getElementById(
      "workerSummaryContainer",
    );

  const summary =
    calculateSummary(
      currentSchedule,
    );

  const table =
    document.createElement(
      "div",
    );

  table.className =
    "worker-table-wrap";

  const rows = WORKERS.map(
    (worker) => {
      let total = 0;

      for (const job of JOBS) {
        total +=
          summary.workerCounts[
            worker
          ][job];
      }

      return `
        <tr>
          <td>${escapeHtml(worker)}</td>
          <td>${summary.workerCounts[worker]["볼분리"]}</td>
          <td>${summary.workerCounts[worker]["볼분리 보조"]}</td>
          <td>${summary.workerCounts[worker]["설거지 및 성형보조"]}</td>
          <td>${summary.workerCounts[worker]["분쇄 및 성형보조"]}</td>
          <td>${summary.workerCounts[worker]["성형 및 분쇄보조"]}</td>
          <td><strong>${total}</strong></td>
        </tr>
      `;
    },
  ).join("");

  table.innerHTML = `
    <table class="worker-table">
      <thead>
        <tr>
          <th>작업자</th>
          <th>볼분리</th>
          <th>볼분리 보조</th>
          <th>설거지</th>
          <th>분쇄</th>
          <th>성형</th>
          <th>총합</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;

  container.innerHTML = "";
  container.appendChild(table);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll(
      "'",
      "&#039;",
    );
}

/* -------------------------------------------
 * 생성 버튼
 * ----------------------------------------- */

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
    alert(
      error instanceof Error
        ? error.message
        : "배정표 생성 중 오류가 발생했습니다.",
    );
  }
}

/* -------------------------------------------
 * 복사
 * ----------------------------------------- */

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
    const textarea =
      document.createElement(
        "textarea",
      );

    textarea.value =
      copiedText;

    document.body.appendChild(
      textarea,
    );

    textarea.select();

    document.execCommand(
      "copy",
    );

    textarea.remove();

    alert(
      "배정표가 복사되었습니다.",
    );
  }
}

/* -------------------------------------------
 * 다크모드
 * ----------------------------------------- */

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
    isDark ? "dark" : "light",
  );

  updateThemeButton();
}

function updateThemeButton() {
  const button =
    document.getElementById(
      "themeToggle",
    );

  const isDark =
    document.body.classList.contains(
      "dark",
    );

  button.textContent = isDark
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

/* -------------------------------------------
 * 초기화
 * ----------------------------------------- */

function initializeApp() {
  restoreTheme();

  document
    .getElementById(
      "generateButton",
    )
    .addEventListener(
      "click",
      handleGenerate,
    );

  document
    .getElementById(
      "copyButton",
    )
    .addEventListener(
      "click",
      handleCopy,
    );

  document
    .getElementById(
      "themeToggle",
    )
    .addEventListener(
      "click",
      handleThemeToggle,
    );
}

document.addEventListener(
  "DOMContentLoaded",
  initializeApp,
);
