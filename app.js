"use strict";

/*
 * 업무 배정표
 *
 * 주요 규칙
 * ------------------------------------------------------------
 * 1. 일반적으로 하루 5개 업무를 5명에게 하나씩 배정한다.
 *
 * 2. 볼분리
 *    - 김 / 탁 / 임만 가능
 *
 * 3. 볼분리 보조
 *    - 김 / 탁 / 임만 가능
 *
 * 4. 설거지 및 성형보조
 *    - 김 / 탁 / 임 / 박 / 류 가능
 *
 * 5. 분쇄 및 성형보조
 *    - 김 / 탁 / 임 / 박 / 류 가능
 *
 * 6. 성형 및 분쇄보조
 *    - 김 / 탁 / 임 / 류 가능
 *    - 박은 직접 배정하지 않음
 *
 * 7. 공정성 우선순위
 *    - 볼분리
 *    - 볼분리 보조
 *    - 류의 3개 업무 순환
 *    - 전체 업무량
 *
 * 8. 연차
 *    - 연차자는 실제 배정에서 제외
 *    - 남은 작업자가 연차자의 업무를 대체
 *    - 한 사람이 2개 업무를 맡을 수 있음
 *    - 연차자의 원래 업무는 공정성 누적에는 수행한 것으로 인정
 *    - 대체 업무는 공정성 누적 계산에서 별도로 가산하지 않음
 *
 * 9. 최근 6개월 상세 이력 + 그 이전 baseline 사용
 */

const DATA_VERSION = 7;

const STORAGE_KEY = "assignment-app-data-v7";
const LEGACY_STORAGE_KEYS = [
  "assignment-app-data-v6",
  "assignment-app-data-v5",
  "assignment-app-data-v4",
  "assignment-app-data-v3",
  "assignment-app-data-v2"
];

const WORKERS = ["김", "탁", "임", "박", "류"];

const TASKS = [
  "볼분리",
  "볼분리 보조",
  "설거지 및 성형보조",
  "분쇄 및 성형보조",
  "성형 및 분쇄보조"
];

const BOWL_TASKS = [
  "볼분리",
  "볼분리 보조"
];

const ELIGIBLE = {
  "볼분리": ["김", "탁", "임"],
  "볼분리 보조": ["김", "탁", "임"],
  "설거지 및 성형보조": ["김", "탁", "임", "박", "류"],
  "분쇄 및 성형보조": ["김", "탁", "임", "박", "류"],
  "성형 및 분쇄보조": ["김", "탁", "임", "류"]
};

const state = {
  data: null,
  currentSchedule: [],
  currentOriginalSchedule: [],
  currentYear: 2026,
  currentMonth: 9,
  calendarYear: 2026,
  calendarMonth: 9
};


/* ============================================================
 * 기본 유틸
 * ============================================================ */

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function makeDateKey(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function getMonthKey(year, month) {
  return `${year}-${pad2(month)}`;
}

function parseDateKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);

  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getDateInfo(year, month, day) {
  const date = new Date(year, month - 1, day);

  const weekdays = [
    "일",
    "월",
    "화",
    "수",
    "목",
    "금",
    "토"
  ];

  return {
    weekdayIndex: date.getDay(),
    weekday: weekdays[date.getDay()]
  };
}

function getTaskIndex(task) {
  return TASKS.indexOf(task);
}

function getWorkerIndex(worker) {
  return WORKERS.indexOf(worker);
}


/* ============================================================
 * 데이터 구조
 * ============================================================ */

function createEmptyCounts() {
  const result = {};

  for (const worker of WORKERS) {
    result[worker] = {};

    for (const task of TASKS) {
      result[worker][task] = 0;
    }
  }

  return result;
}

function createEmptyData() {
  return {
    version: DATA_VERSION,
    retentionMonths: 6,
    baseline: createEmptyCounts(),
    history: {},
    leave: {}
  };
}

function normalizeCounts(source) {
  const result = createEmptyCounts();

  if (!source || typeof source !== "object") {
    return result;
  }

  for (const worker of WORKERS) {
    if (!source[worker] || typeof source[worker] !== "object") {
      continue;
    }

    for (const task of TASKS) {
      const value = Number(source[worker][task]);

      if (Number.isFinite(value) && value >= 0) {
        result[worker][task] = value;
      }
    }
  }

  return result;
}

function normalizeSchedule(schedule) {
  if (!Array.isArray(schedule)) {
    return [];
  }

  return schedule
    .filter(item => item && typeof item === "object")
    .map(item => ({
      day: Number(item.day),
      weekday: item.weekday || "",
      assignments: item.assignments && typeof item.assignments === "object"
        ? { ...item.assignments }
        : {},
      leaveWorkers: Array.isArray(item.leaveWorkers)
        ? [...item.leaveWorkers]
        : []
    }))
    .filter(item => Number.isFinite(item.day) && item.day >= 1);
}

function normalizeOriginalCounts(source) {
  return normalizeCounts(source);
}

function normalizeHistory(history) {
  const result = {};

  if (!history || typeof history !== "object") {
    return result;
  }

  for (const [monthKey, monthValue] of Object.entries(history)) {

    if (!monthValue || typeof monthValue !== "object") {
      continue;
    }

    result[monthKey] = {
      schedule: normalizeSchedule(monthValue.schedule),
      originalCounts: normalizeOriginalCounts(monthValue.originalCounts),
      leave: normalizeLeaveObject(monthValue.leave)
    };
  }

  return result;
}

function normalizeLeaveObject(source) {
  const result = {};

  if (!source || typeof source !== "object") {
    return result;
  }

  for (const [dateKey, workers] of Object.entries(source)) {

    if (!Array.isArray(workers)) {
      continue;
    }

    result[dateKey] = workers.filter(worker =>
      WORKERS.includes(worker)
    );
  }

  return result;
}

function normalizeData(source) {

  const data = createEmptyData();

  if (!source || typeof source !== "object") {
    return data;
  }

  data.version = DATA_VERSION;

  if (Number.isFinite(Number(source.retentionMonths))) {
    data.retentionMonths = Number(source.retentionMonths);
  }

  data.baseline = normalizeCounts(source.baseline);
  data.history = normalizeHistory(source.history);
  data.leave = normalizeLeaveObject(source.leave);

  /*
   * 이전 데이터 구조에서 month.history 내부의 leave가 있는 경우
   * 전역 leave에도 합쳐준다.
   */
  for (const [monthKey, monthValue] of Object.entries(data.history)) {

    if (!monthValue.leave) {
      continue;
    }

    for (const [dateKey, workers] of Object.entries(monthValue.leave)) {
      data.leave[dateKey] = [...workers];
    }
  }

  return data;
}


/* ============================================================
 * localStorage
 * ============================================================ */

function loadLocalData() {

  const current = localStorage.getItem(STORAGE_KEY);

  if (current) {
    try {
      return normalizeData(JSON.parse(current));
    } catch (error) {
      console.warn("현재 localStorage 데이터 읽기 실패:", error);
    }
  }

  for (const key of LEGACY_STORAGE_KEYS) {

    const legacy = localStorage.getItem(key);

    if (!legacy) {
      continue;
    }

    try {
      const parsed = normalizeData(JSON.parse(legacy));

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(parsed)
      );

      return parsed;

    } catch (error) {
      console.warn(`이전 데이터 읽기 실패: ${key}`, error);
    }
  }

  return createEmptyData();
}

function saveLocalData() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(state.data)
  );
}


/* ============================================================
 * GitHub
 * ============================================================ */

function getGithubConfig() {

  return {
    owner:
      localStorage.getItem("assignment-github-owner") || "",

    repo:
      localStorage.getItem("assignment-github-repo") || "",

    branch:
      localStorage.getItem("assignment-github-branch") || "main",

    path:
      localStorage.getItem("assignment-github-path") ||
      "data/history.json"
  };
}

function loadGithubConfigToForm() {

  const config = getGithubConfig();

  document.getElementById("github-owner-input").value =
    config.owner;

  document.getElementById("github-repo-input").value =
    config.repo;

  document.getElementById("github-branch-input").value =
    config.branch;

  document.getElementById("github-path-input").value =
    config.path;
}

function saveGithubSettings() {

  const owner =
    document.getElementById("github-owner-input").value.trim();

  const repo =
    document.getElementById("github-repo-input").value.trim();

  const branch =
    document.getElementById("github-branch-input").value.trim() ||
    "main";

  const path =
    document.getElementById("github-path-input").value.trim() ||
    "data/history.json";

  localStorage.setItem("assignment-github-owner", owner);
  localStorage.setItem("assignment-github-repo", repo);
  localStorage.setItem("assignment-github-branch", branch);
  localStorage.setItem("assignment-github-path", path);

  showGithubStatus("GitHub 설정을 저장했습니다.");

  showToast("GitHub 설정 저장 완료");
}

function getGithubRawUrl() {

  const config = getGithubConfig();

  if (!config.owner || !config.repo) {
    return "";
  }

  return `https://raw.githubusercontent.com/${encodeURIComponent(
    config.owner
  )}/${encodeURIComponent(
    config.repo
  )}/${encodeURIComponent(
    config.branch
  )}/${config.path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

async function loadGithubData() {

  const url = getGithubRawUrl();

  if (!url) {
    return null;
  }

  try {

    const response = await fetch(
      `${url}?t=${Date.now()}`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await response.json();

    return normalizeData(json);

  } catch (error) {

    console.warn("GitHub 데이터 불러오기 실패:", error);

    return null;
  }
}

function prepareGithubSave() {

  const config = getGithubConfig();

  if (!config.owner || !config.repo) {

    showGithubStatus(
      "먼저 GitHub 사용자명과 저장소를 입력하세요.",
      true
    );

    return;
  }

  const jsonText = JSON.stringify(
    state.data,
    null,
    2
  );

  navigator.clipboard
    .writeText(jsonText)
    .then(() => {

      const editUrl =
        `https://github.com/${encodeURIComponent(
          config.owner
        )}/${encodeURIComponent(
          config.repo
        )}/edit/${encodeURIComponent(
          config.branch
        )}/${config.path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`;

      window.open(editUrl, "_blank");

      showGithubStatus(
        "history.json 내용을 클립보드에 복사했습니다. GitHub 편집 화면에서 전체 내용을 붙여넣고 Commit changes를 누르세요."
      );

      showToast("JSON 복사 완료");

    })
    .catch(() => {

      showGithubStatus(
        "자동 복사에 실패했습니다. 브라우저의 클립보드 권한을 확인하세요.",
        true
      );
    });
}

function showGithubStatus(message, isError = false) {

  const element =
    document.getElementById("github-status");

  element.textContent = message;

  element.className =
    isError
      ? "status-text warning-text"
      : "status-text success-text";
}


/* ============================================================
 * 연차
 * ============================================================ */

function getLeaveWorkers(dateKey) {

  if (!state.data.leave[dateKey]) {
    return [];
  }

  return [...state.data.leave[dateKey]];
}

function setLeaveWorkers(dateKey, workers) {

  const normalized = [
    ...new Set(
      workers.filter(worker =>
        WORKERS.includes(worker)
      )
    )
  ];

  if (normalized.length === 0) {
    delete state.data.leave[dateKey];
  } else {
    state.data.leave[dateKey] = normalized;
  }

  saveLocalData();
}

function saveLeave() {

  const dateInput =
    document.getElementById("leave-date-input");

  const dateKey = dateInput.value;

  if (!dateKey) {
    showToast("연차 날짜를 선택하세요.");
    return;
  }

  const workers = [
    ...document.querySelectorAll(".leave-worker:checked")
  ].map(input => input.value);

  setLeaveWorkers(dateKey, workers);

  renderLeaveList();
  renderCalendar();

  showToast(
    workers.length
      ? `${dateKey} 연차 저장 완료`
      : `${dateKey} 연차 삭제 완료`
  );
}

function deleteLeave() {

  const dateKey =
    document.getElementById("leave-date-input").value;

  if (!dateKey) {
    showToast("연차 날짜를 선택하세요.");
    return;
  }

  delete state.data.leave[dateKey];

  saveLocalData();

  clearLeaveCheckboxes();
  renderLeaveList();
  renderCalendar();

  showToast(`${dateKey} 연차를 삭제했습니다.`);
}

function clearLeaveCheckboxes() {

  document
    .querySelectorAll(".leave-worker")
    .forEach(input => {
      input.checked = false;
    });
}

function loadLeaveToForm(dateKey) {

  document.getElementById("leave-date-input").value =
    dateKey;

  const workers = getLeaveWorkers(dateKey);

  document
    .querySelectorAll(".leave-worker")
    .forEach(input => {
      input.checked =
        workers.includes(input.value);
    });
}

function renderLeaveList() {

  const container =
    document.getElementById("leave-list");

  const entries =
    Object.entries(state.data.leave)
      .filter(([dateKey]) => {
        const parsed = parseDateKey(dateKey);

        if (!parsed) {
          return false;
        }

        return (
          parsed.year === state.currentYear &&
          parsed.month === state.currentMonth
        );
      })
      .sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) {

    container.innerHTML =
      `<div class="empty-message">이번 달 등록된 연차가 없습니다.</div>`;

    return;
  }

  container.innerHTML =
    entries.map(([dateKey, workers]) => {

      return `
        <div class="leave-item">
          <div>
            <div class="leave-date">${escapeHtml(dateKey)}</div>
            <div class="leave-workers">
              ${workers.map(escapeHtml).join(", ")}
            </div>
          </div>

          <button
            class="secondary-button"
            type="button"
            data-load-leave="${escapeHtml(dateKey)}">
            수정
          </button>
        </div>
      `;
    }).join("");

  container
    .querySelectorAll("[data-load-leave]")
    .forEach(button => {

      button.addEventListener("click", () => {

        loadLeaveToForm(
          button.dataset.loadLeave
        );

        document
          .getElementById("leave-date-input")
          .scrollIntoView({
            behavior: "smooth",
            block: "center"
          });
      });
    });
}


/* ============================================================
 * 배정 후보 생성
 * ============================================================ */

function isEligible(worker, task) {
  return ELIGIBLE[task].includes(worker);
}

function countWorkerTasks(assignments) {

  const counts = {};

  for (const worker of WORKERS) {
    counts[worker] = 0;
  }

  for (const task of TASKS) {

    const worker = assignments[task];

    if (WORKERS.includes(worker)) {
      counts[worker]++;
    }
  }

  return counts;
}

function countTaskForWorker(counts, worker, task) {

  if (!counts[worker]) {
    return 0;
  }

  return Number(counts[worker][task] || 0);
}

function totalWorkerCount(counts, worker) {

  if (!counts[worker]) {
    return 0;
  }

  return TASKS.reduce(
    (sum, task) =>
      sum + Number(counts[worker][task] || 0),
    0
  );
}

function buildAccumulatedCounts() {

  const result =
    normalizeCounts(state.data.baseline);

  const monthKeys =
    Object.keys(state.data.history).sort();

  for (const monthKey of monthKeys) {

    const month =
      state.data.history[monthKey];

    if (!month || !month.originalCounts) {
      continue;
    }

    for (const worker of WORKERS) {

      for (const task of TASKS) {

        result[worker][task] +=
          Number(
            month.originalCounts?.[worker]?.[task] || 0
          );
      }
    }
  }

  return result;
}

function getCurrentHistoryBeforeMonth() {

  const counts =
    buildAccumulatedCounts();

  const currentMonthKey =
    getMonthKey(
      state.currentYear,
      state.currentMonth
    );

  const current =
    state.data.history[currentMonthKey];

  if (!current) {
    return counts;
  }

  for (const worker of WORKERS) {

    for (const task of TASKS) {

      counts[worker][task] -=
        Number(
          current.originalCounts?.[worker]?.[task] || 0
        );
    }
  }

  return counts;
}

function assignmentSignature(assignments) {

  return TASKS
    .map(task => assignments[task] || "")
    .join("|");
}

function createNormalAssignments(accumulated, previousAssignments) {

  const candidates = [];

  function recursive(index, usedWorkers, assignments) {

    if (index >= TASKS.length) {

      candidates.push({
        assignments: { ...assignments }
      });

      return;
    }

    const task = TASKS[index];

    const workers =
      ELIGIBLE[task]
        .filter(worker =>
          !usedWorkers.has(worker)
        );

    for (const worker of workers) {

      assignments[task] = worker;
      usedWorkers.add(worker);

      recursive(
        index + 1,
        usedWorkers,
        assignments
      );

      usedWorkers.delete(worker);
      delete assignments[task];
    }
  }

  recursive(
    0,
    new Set(),
    {}
  );

  return candidates;
}

function scoreNormalCandidate(
  assignments,
  accumulated,
  previousAssignments,
  day
) {

  const counts =
    countWorkerTasks(assignments);

  let score = 0;

  /*
   * 1순위: 볼분리
   */
  const bowlWorkers =
    ["김", "탁", "임"];

  const bowlCounts =
    bowlWorkers.map(worker =>
      accumulated[worker]["볼분리"]
    );

  const bowlAverage =
    bowlCounts.reduce((a, b) => a + b, 0) /
    bowlCounts.length;

  const bowlWorker =
    assignments["볼분리"];

  score +=
    Math.pow(
      accumulated[bowlWorker]["볼분리"] -
      bowlAverage,
      2
    ) * 1000;

  /*
   * 2순위: 볼분리 보조
   */
  const bowlAssistAverage =
    bowlWorkers.reduce(
      (sum, worker) =>
        sum +
        accumulated[worker]["볼분리 보조"],
      0
    ) / bowlWorkers.length;

  const bowlAssistWorker =
    assignments["볼분리 보조"];

  score +=
    Math.pow(
      accumulated[bowlAssistWorker]["볼분리 보조"] -
      bowlAssistAverage,
      2
    ) * 500;

  /*
   * 전체 업무량
   */
  for (const worker of WORKERS) {

    const currentTotal =
      totalWorkerCount(
        accumulated,
        worker
      );

    const target =
      Object.values(accumulated)
        .reduce(
          (sum, workerCounts) =>
            sum +
            TASKS.reduce(
              (s, task) =>
                s +
                Number(workerCounts[task] || 0),
              0
            ),
          0
        ) / WORKERS.length;

    score +=
      Math.pow(
        currentTotal + counts[worker] - target,
        2
      ) * 4;
  }

  /*
   * 류 업무 순환
   */
  const ryooTask =
    assignments["설거지 및 성형보조"] === "류"
      ? "설거지 및 성형보조"
      : assignments["분쇄 및 성형보조"] === "류"
        ? "분쇄 및 성형보조"
        : assignments["성형 및 분쇄보조"] === "류"
          ? "성형 및 분쇄보조"
          : null;

  if (previousAssignments && ryooTask) {

    if (
      previousAssignments[ryooTask] === "류"
    ) {
      score += 150;
    }
  }

  /*
   * 같은 사람이 같은 업무를 연속해서 맡는 것 완화
   */
  if (previousAssignments) {

    for (const task of TASKS) {

      if (
        previousAssignments[task] ===
        assignments[task]
      ) {
        score += 8;
      }
    }
  }

  /*
   * 날짜를 활용한 약한 분산
   */
  score +=
    (getWorkerIndex(assignments["볼분리"]) + day % 3)
    * 0.001;

  return score;
}

function chooseNormalAssignment(
  accumulated,
  previousAssignments,
  day
) {

  const candidates =
    createNormalAssignments(
      accumulated,
      previousAssignments
    );

  let best = null;

  for (const candidate of candidates) {

    const score =
      scoreNormalCandidate(
        candidate.assignments,
        accumulated,
        previousAssignments,
        day
      );

    if (
      !best ||
      score < best.score
    ) {

      best = {
        score,
        assignments: candidate.assignments
      };
    }
  }

  return best
    ? best.assignments
    : null;
}


/* ============================================================
 * 연차 대체 배정
 * ============================================================ */

function canCoverTask(worker, task) {

  return (
    WORKERS.includes(worker) &&
    isEligible(worker, task)
  );
}

function calculateReplacementPenalty(
  worker,
  task,
  actualAssignments,
  accumulated
) {

  let score = 0;

  /*
   * 이미 다른 업무를 맡고 있으면 추가 업무.
   * 추가 업무 자체는 누적 공정성에 반영하지 않지만
   * 실제 하루 부담을 최소화하는 방향으로 선택한다.
   */
  const alreadyWorking =
    Object.values(actualAssignments)
      .includes(worker);

  if (alreadyWorking) {
    score += 20;
  }

  /*
   * 볼분리 계열은 핵심 담당자 균등을 우선한다.
   */
  if (task === "볼분리") {

    score +=
      accumulated[worker]["볼분리"] * 1000;
  }

  if (task === "볼분리 보조") {

    score +=
      accumulated[worker]["볼분리 보조"] * 500;
  }

  /*
   * 전체 누적 업무량이 많은 사람을 약간 피한다.
   */
  score +=
    totalWorkerCount(
      accumulated,
      worker
    ) * 2;

  return score;
}

function applyLeaveToSchedule(
  originalAssignments,
  leaveWorkers,
  accumulated
) {

  const actualAssignments = {};

  /*
   * 연차가 아닌 원래 배정은 우선 그대로 유지
   */
  for (const task of TASKS) {

    const worker =
      originalAssignments[task];

    if (!leaveWorkers.includes(worker)) {

      actualAssignments[task] =
        worker;
    }
  }

  const missingTasks =
    TASKS.filter(task =>
      !Object.prototype.hasOwnProperty.call(
        actualAssignments,
        task
      )
    );

  /*
   * 실제 대체 가능한 작업자를 찾아
   * 가장 부담이 적은 조합을 선택한다.
   *
   * 모든 사람이 한 번씩만 일해야 하는 날은 아니므로
   * 같은 사람이 여러 업무를 맡을 수 있다.
   */
  for (const task of missingTasks) {

    const candidates =
      WORKERS.filter(worker =>
        !leaveWorkers.includes(worker) &&
        canCoverTask(worker, task)
      );

    if (candidates.length === 0) {

      return {
        feasible: false,
        assignments: actualAssignments,
        reason:
          `${task}을 맡을 수 있는 근무자가 없습니다.`
      };
    }

    candidates.sort((a, b) => {

      const scoreA =
        calculateReplacementPenalty(
          a,
          task,
          actualAssignments,
          accumulated
        );

      const scoreB =
        calculateReplacementPenalty(
          b,
          task,
          actualAssignments,
          accumulated
        );

      return scoreA - scoreB;
    });

    actualAssignments[task] =
      candidates[0];
  }

  return {
    feasible: true,
    assignments: actualAssignments
  };
}

function validateActualAssignments(
  assignments,
  leaveWorkers
) {

  for (const task of TASKS) {

    const worker =
      assignments[task];

    if (!worker) {
      return false;
    }

    if (leaveWorkers.includes(worker)) {
      return false;
    }

    if (!isEligible(worker, task)) {
      return false;
    }
  }

  return true;
}


/* ============================================================
 * 월간 생성
 * ============================================================ */

function createOriginalCounts(schedule) {

  const counts =
    createEmptyCounts();

  for (const day of schedule) {

    for (const task of TASKS) {

      const worker =
        day.assignments?.[task];

      if (
        WORKERS.includes(worker)
      ) {
        counts[worker][task]++;
      }
    }
  }

  return counts;
}

function generateMonthSchedule(
  year,
  month,
  startDay,
  endDay
) {

  const accumulated =
    getCurrentHistoryBeforeMonth();

  const originalSchedule = [];
  const actualSchedule = [];

  let previousAssignments = null;

  for (
    let day = startDay;
    day <= endDay;
    day++
  ) {

    const dateKey =
      makeDateKey(
        year,
        month,
        day
      );

    const leaveWorkers =
      getLeaveWorkers(dateKey);

    /*
     * 정상 5인 배정은 연차 여부와 관계없이 생성한다.
     * 이 결과가 누적 공정성 기준이 된다.
     */
    const originalAssignments =
      chooseNormalAssignment(
        accumulated,
        previousAssignments,
        day
      );

    if (!originalAssignments) {
      throw new Error(
        `${dateKey} 정상 배정을 만들 수 없습니다.`
      );
    }

    const replacement =
      applyLeaveToSchedule(
        originalAssignments,
        leaveWorkers,
        accumulated
      );

    if (
      !replacement.feasible ||
      !validateActualAssignments(
        replacement.assignments,
        leaveWorkers
      )
    ) {

      throw new Error(
        `${dateKey} 연차 대체 배정을 만들 수 없습니다.\n` +
        `${replacement.reason || ""}`
      );
    }

    const dateInfo =
      getDateInfo(
        year,
        month,
        day
      );

    originalSchedule.push({
      day,
      dateKey,
      weekday: dateInfo.weekday,
      assignments: {
        ...originalAssignments
      },
      leaveWorkers: [
        ...leaveWorkers
      ]
    });

    actualSchedule.push({
      day,
      dateKey,
      weekday: dateInfo.weekday,
      assignments: {
        ...replacement.assignments
      },
      originalAssignments: {
        ...originalAssignments
      },
      leaveWorkers: [
        ...leaveWorkers
      ]
    });

    /*
     * 다음 날의 연속 업무 판단에는
     * 정상 배정을 사용한다.
     */
    previousAssignments =
      originalAssignments;

    /*
     * 같은 달의 다음 날부터는
     * 방금 생성한 정상 배정을 누적 기준에 임시 반영한다.
     */
    for (const task of TASKS) {

      const worker =
        originalAssignments[task];

      if (WORKERS.includes(worker)) {
        accumulated[worker][task]++;
      }
    }
  }

  return {
    originalSchedule,
    actualSchedule
  };
}


/* ============================================================
 * 현재 월 이력 저장
 * ============================================================ */

function saveCurrentMonthHistory() {

  if (
    state.currentOriginalSchedule.length === 0
  ) {
    return;
  }

  const monthKey =
    getMonthKey(
      state.currentYear,
      state.currentMonth
    );

  const originalCounts =
    createOriginalCounts(
      state.currentOriginalSchedule
    );

  const leaveForMonth = {};

  for (const day of state.currentOriginalSchedule) {

    const workers =
      getLeaveWorkers(day.dateKey);

    if (workers.length > 0) {
      leaveForMonth[day.dateKey] = [
        ...workers
      ];
    }
  }

  state.data.history[monthKey] = {
    schedule:
      deepClone(
        state.currentSchedule
      ),
    originalCounts,
    leave: leaveForMonth
  };

  saveLocalData();
}


/* ============================================================
 * 배정 결과 렌더링
 * ============================================================ */

function renderSchedule() {

  const container =
    document.getElementById(
      "schedule-result"
    );

  if (
    state.currentSchedule.length === 0
  ) {

    container.innerHTML =
      `<div class="empty-message">아직 배정표가 없습니다.</div>`;

    return;
  }

  container.innerHTML =
    state.currentSchedule
      .map(day => {

        const leaveText =
          day.leaveWorkers.length > 0
            ? `연차: ${day.leaveWorkers.join(", ")}`
            : "";

        const assignmentItems =
          TASKS.map(task => {

            const worker =
              day.assignments[task];

            const isExtra =
              Object.values(day.assignments)
                .filter(value => value === worker)
                .length > 1;

            return `
              <div class="assignment-item">
                <div class="assignment-task-name">
                  ${escapeHtml(task)}
                </div>

                <div class="assignment-person ${
                  isExtra ? "extra-task" : ""
                }">
                  ${escapeHtml(worker || "-")}
                </div>
              </div>
            `;
          }).join("");

        return `
          <div class="schedule-day">

            <div class="schedule-day-header">

              <div class="schedule-date">
                ${day.day}일 (${escapeHtml(day.weekday)})
              </div>

              ${
                leaveText
                  ? `<div class="schedule-leave">
                       ${escapeHtml(leaveText)}
                     </div>`
                  : ""
              }

            </div>

            <div class="assignment-list">
              ${assignmentItems}
            </div>

          </div>
        `;
      })
      .join("");

  document.getElementById(
    "result-summary"
  ).textContent =
    `${state.currentYear}년 ${state.currentMonth}월 ` +
    `${state.currentSchedule.length}일 배정 완료`;
}


/* ============================================================
 * 누적 현황
 * ============================================================ */

function renderBalance() {

  const container =
    document.getElementById(
      "balance-result"
    );

  const counts =
    buildAccumulatedCounts();

  let html = `
    <div style="overflow-x:auto;">
      <table class="balance-table">
        <thead>
          <tr>
            <th>작업자</th>
            ${TASKS.map(task =>
              `<th>${escapeHtml(task)}</th>`
            ).join("")}
            <th>총합</th>
          </tr>
        </thead>
        <tbody>
  `;

  for (const worker of WORKERS) {

    const total =
      totalWorkerCount(
        counts,
        worker
      );

    html += `
      <tr>
        <td>${escapeHtml(worker)}</td>

        ${TASKS.map(task =>
          `<td>${counts[worker][task]}</td>`
        ).join("")}

        <td><strong>${total}</strong></td>
      </tr>
    `;
  }

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
}


/* ============================================================
 * 달력
 * ============================================================ */

function renderCalendar() {

  const calendar =
    document.getElementById(
      "calendar"
    );

  const title =
    document.getElementById(
      "calendar-title"
    );

  title.textContent =
    `${state.calendarYear}년 ${state.calendarMonth}월`;

  const weekdays = [
    "일",
    "월",
    "화",
    "수",
    "목",
    "금",
    "토"
  ];

  let html =
    weekdays
      .map(day =>
        `<div class="calendar-weekday">${day}</div>`
      )
      .join("");

  const firstDate =
    new Date(
      state.calendarYear,
      state.calendarMonth - 1,
      1
    );

  const firstWeekday =
    firstDate.getDay();

  const daysInMonth =
    getDaysInMonth(
      state.calendarYear,
      state.calendarMonth
    );

  const previousMonthDays =
    getDaysInMonth(
      state.calendarYear,
      state.calendarMonth - 1 <= 0
        ? 12
        : state.calendarMonth - 1
    );

  for (let i = firstWeekday - 1; i >= 0; i--) {

    const day =
      previousMonthDays - i;

    html += `
      <div class="calendar-day other-month">
        <div class="calendar-day-number">
          ${day}
        </div>
      </div>
    `;
  }

  for (
    let day = 1;
    day <= daysInMonth;
    day++
  ) {

    const dateKey =
      makeDateKey(
        state.calendarYear,
        state.calendarMonth,
        day
      );

    const scheduleDay =
      state.currentSchedule.find(
        item =>
          item.dateKey === dateKey
      );

    const leaveWorkers =
      getLeaveWorkers(dateKey);

    let assignmentsHtml = "";

    if (scheduleDay) {

      assignmentsHtml =
        TASKS.map(task => {

          const worker =
            scheduleDay.assignments[task];

          const isLeave =
            leaveWorkers.includes(worker);

          const isDouble =
            Object.values(
              scheduleDay.assignments
            ).filter(
              value => value === worker
            ).length > 1;

          return `
            <div class="calendar-assignment ${
              isDouble
                ? "double-task"
                : ""
            } ${
              isLeave
                ? "leave-assignment"
                : ""
            }">
              <span class="assignment-worker">
                ${escapeHtml(worker || "-")}
              </span>

              <span class="assignment-task">
                ${escapeHtml(task)}
              </span>
            </div>
          `;
        }).join("");
    }

    html += `
      <div
        class="calendar-day"
        data-calendar-date="${dateKey}">

        <div class="calendar-day-number">

          <span>${day}</span>

          ${
            leaveWorkers.length
              ? `
                <span class="leave-badge">
                  연차 ${leaveWorkers.length}
                </span>
              `
              : ""
          }

        </div>

        ${assignmentsHtml}

      </div>
    `;
  }

  const totalCells =
    Math.ceil(
      (firstWeekday + daysInMonth) / 7
    ) * 7;

  const usedCells =
    firstWeekday + daysInMonth;

  const nextMonthCells =
    totalCells - usedCells;

  for (
    let day = 1;
    day <= nextMonthCells;
    day++
  ) {

    html += `
      <div class="calendar-day other-month">
        <div class="calendar-day-number">
          ${day}
        </div>
      </div>
    `;
  }

  calendar.innerHTML = html;

  calendar
    .querySelectorAll("[data-calendar-date]")
    .forEach(element => {

      element.addEventListener(
        "click",
        () => {

          openDayModal(
            element.dataset.calendarDate
          );
        }
      );
    });
}


/* ============================================================
 * 날짜 상세 모달
 * ============================================================ */

function openDayModal(dateKey) {

  const parsed =
    parseDateKey(dateKey);

  if (!parsed) {
    return;
  }

  const scheduleDay =
    state.currentSchedule.find(
      item =>
        item.dateKey === dateKey
    );

  const leaveWorkers =
    getLeaveWorkers(dateKey);

  document.getElementById(
    "modal-title"
  ).textContent =
    `${parsed.year}년 ${parsed.month}월 ${parsed.day}일`;

  let html = "";

  if (leaveWorkers.length > 0) {

    html += `
      <div class="modal-leave">
        연차: ${leaveWorkers
          .map(escapeHtml)
          .join(", ")}
      </div>
    `;
  }

  if (!scheduleDay) {

    html += `
      <div class="empty-message">
        현재 생성된 배정표에 포함되지 않은 날짜입니다.
      </div>
    `;

  } else {

    html += TASKS.map(task => {

      const worker =
        scheduleDay.assignments[task];

      const isExtra =
        Object.values(
          scheduleDay.assignments
        ).filter(
          value => value === worker
        ).length > 1;

      return `
        <div class="modal-assignment">

          <div class="modal-task">
            ${escapeHtml(task)}
          </div>

          <div class="modal-worker ${
            isExtra ? "double-task" : ""
          }">
            ${escapeHtml(worker || "-")}
            ${isExtra ? " (추가업무)" : ""}
          </div>

        </div>
      `;

    }).join("");
  }

  html += `
    <div style="margin-top:16px;">
      <button
        id="modal-leave-button"
        class="secondary-button"
        type="button">
        이 날짜 연차 관리
      </button>
    </div>
  `;

  document.getElementById(
    "modal-body"
  ).innerHTML = html;

  document
    .getElementById("modal-leave-button")
    .addEventListener(
      "click",
      () => {

        loadLeaveToForm(dateKey);

        closeDayModal();

        document
          .getElementById(
            "leave-date-input"
          )
          .scrollIntoView({
            behavior: "smooth",
            block: "center"
          });
      }
    );

  document
    .getElementById("day-modal")
    .classList.remove("hidden");
}

function closeDayModal() {

  document
    .getElementById("day-modal")
    .classList.add("hidden");
}


/* ============================================================
 * 파일 출력
 * ============================================================ */

function getExportBaseName() {

  return `업무배정표_${state.currentYear}년_${pad2(
    state.currentMonth
  )}월`;
}

function getExportRows() {

  const rows = [];

  for (const day of state.currentSchedule) {

    for (const task of TASKS) {

      rows.push({
        날짜: `${state.currentYear}-${pad2(
          state.currentMonth
        )}-${pad2(day.day)}`,

        요일: day.weekday,

        업무: task,

        담당자:
          day.assignments?.[task] || "",

        연차자:
          day.leaveWorkers?.join(", ") || ""
      });
    }
  }

  return rows;
}

function getCalendarExportRows() {

  const rows = [];

  for (const day of state.currentSchedule) {

    const row = {
      날짜: `${state.currentYear}-${pad2(
        state.currentMonth
      )}-${pad2(day.day)}`,

      요일: day.weekday,

      "볼분리":
        day.assignments?.["볼분리"] || "",

      "볼분리 보조":
        day.assignments?.["볼분리 보조"] || "",

      "설거지 및 성형보조":
        day.assignments?.["설거지 및 성형보조"] || "",

      "분쇄 및 성형보조":
        day.assignments?.["분쇄 및 성형보조"] || "",

      "성형 및 분쇄보조":
        day.assignments?.["성형 및 분쇄보조"] || "",

      "연차":
        day.leaveWorkers?.join(", ") || ""
    };

    rows.push(row);
  }

  return rows;
}

function exportXlsx() {

  if (
    state.currentSchedule.length === 0
  ) {

    showToast("먼저 배정표를 생성하세요.");
    return;
  }

  if (
    typeof XLSX === "undefined"
  ) {

    showToast(
      "Excel 기능을 불러오지 못했습니다. 인터넷 연결을 확인하세요."
    );

    return;
  }

  const workbook =
    XLSX.utils.book_new();

  /*
   * 1번 시트: 월간 배정표
   */
  const calendarRows =
    getCalendarExportRows();

  const calendarSheet =
    XLSX.utils.json_to_sheet(
      calendarRows
    );

  calendarSheet["!cols"] = [
    { wch: 14 },
    { wch: 6 },
    { wch: 14 },
    { wch: 14 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 16 }
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    calendarSheet,
    "월간 배정표"
  );

  /*
   * 2번 시트: 세로형 상세 데이터
   */
  const detailRows =
    getExportRows();

  const detailSheet =
    XLSX.utils.json_to_sheet(
      detailRows
    );

  detailSheet["!cols"] = [
    { wch: 14 },
    { wch: 6 },
    { wch: 22 },
    { wch: 12 },
    { wch: 20 }
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    detailSheet,
    "상세 데이터"
  );

  /*
   * 3번 시트: 누적 현황
   */
  const counts =
    buildAccumulatedCounts();

  const balanceRows =
    WORKERS.map(worker => {

      const row = {
        작업자: worker
      };

      for (const task of TASKS) {
        row[task] =
          counts[worker][task];
      }

      row["총합"] =
        totalWorkerCount(
          counts,
          worker
        );

      return row;
    });

  const balanceSheet =
    XLSX.utils.json_to_sheet(
      balanceRows
    );

  balanceSheet["!cols"] = [
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 10 }
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    balanceSheet,
    "누적 현황"
  );

  /*
   * 4번 시트: 연차
   */
  const leaveRows =
    Object.entries(
      state.data.leave
    )
      .filter(([dateKey]) => {

        const parsed =
          parseDateKey(dateKey);

        return (
          parsed &&
          parsed.year === state.currentYear &&
          parsed.month === state.currentMonth
        );
      })
      .sort(([a], [b]) =>
        a.localeCompare(b)
      )
      .map(([dateKey, workers]) => ({
        날짜: dateKey,
        연차자: workers.join(", ")
      }));

  const leaveSheet =
    XLSX.utils.json_to_sheet(
      leaveRows.length
        ? leaveRows
        : [{ 날짜: "", 연차자: "" }]
    );

  leaveSheet["!cols"] = [
    { wch: 14 },
    { wch: 20 }
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    leaveSheet,
    "연차"
  );

  XLSX.writeFile(
    workbook,
    `${getExportBaseName()}.xlsx`
  );

  document.getElementById(
    "export-status"
  ).textContent =
    "Excel 파일을 생성했습니다. Google Drive에 업로드하면 Google 스프레드시트로 열 수 있습니다.";

  showToast("Excel 파일 생성 완료");
}

function exportCsv() {

  if (
    state.currentSchedule.length === 0
  ) {

    showToast("먼저 배정표를 생성하세요.");
    return;
  }

  const rows =
    getCalendarExportRows();

  const headers =
    Object.keys(rows[0]);

  const csvEscape = value => {

    const text =
      String(value ?? "");

    if (
      text.includes(",") ||
      text.includes('"') ||
      text.includes("\n")
    ) {

      return `"${text.replace(
        /"/g,
        '""'
      )}"`;
    }

    return text;
  };

  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map(row =>
      headers
        .map(header =>
          csvEscape(row[header])
        )
        .join(",")
    )
  ].join("\r\n");

  /*
   * Excel/한글에서 한글이 깨지지 않도록 BOM 추가
   */
  const blob =
    new Blob(
      ["\uFEFF" + csv],
      {
        type: "text/csv;charset=utf-8;"
      }
    );

  downloadBlob(
    blob,
    `${getExportBaseName()}.csv`
  );

  document.getElementById(
    "export-status"
  ).textContent =
    "CSV 파일을 생성했습니다.";

  showToast("CSV 파일 생성 완료");
}

function exportJson() {

  const json =
    JSON.stringify(
      state.data,
      null,
      2
    );

  const blob =
    new Blob(
      [json],
      {
        type: "application/json;charset=utf-8;"
      }
    );

  downloadBlob(
    blob,
    `${getExportBaseName()}_백업.json`
  );

  document.getElementById(
    "export-status"
  ).textContent =
    "전체 배정 데이터 JSON 백업을 생성했습니다.";

  showToast("JSON 백업 완료");
}

function downloadBlob(blob, filename) {

  const url =
    URL.createObjectURL(blob);

  const anchor =
    document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);

  anchor.click();

  anchor.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}


/* ============================================================
 * 월 이동
 * ============================================================ */

function changeCalendarMonth(delta) {

  let year =
    state.calendarYear;

  let month =
    state.calendarMonth + delta;

  if (month < 1) {
    month = 12;
    year--;
  }

  if (month > 12) {
    month = 1;
    year++;
  }

  state.calendarYear = year;
  state.calendarMonth = month;

  renderCalendar();
}


/* ============================================================
 * 생성
 * ============================================================ */

function getGenerationSettings() {

  const year =
    Number(
      document.getElementById(
        "year-input"
      ).value
    );

  const month =
    Number(
      document.getElementById(
        "month-input"
      ).value
    );

  const startDay =
    Number(
      document.getElementById(
        "start-day-input"
      ).value
    );

  const endDay =
    Number(
      document.getElementById(
        "end-day-input"
      ).value
    );

  return {
    year,
    month,
    startDay,
    endDay
  };
}

function validateGenerationSettings(
  settings
) {

  if (
    !Number.isInteger(settings.year) ||
    settings.year < 2020 ||
    settings.year > 2100
  ) {
    return "연도를 확인하세요.";
  }

  if (
    !Number.isInteger(settings.month) ||
    settings.month < 1 ||
    settings.month > 12
  ) {
    return "월을 확인하세요.";
  }

  const daysInMonth =
    getDaysInMonth(
      settings.year,
      settings.month
    );

  if (
    !Number.isInteger(settings.startDay) ||
    settings.startDay < 1 ||
    settings.startDay > daysInMonth
  ) {
    return "시작일을 확인하세요.";
  }

  if (
    !Number.isInteger(settings.endDay) ||
    settings.endDay < settings.startDay ||
    settings.endDay > daysInMonth
  ) {
    return "종료일을 확인하세요.";
  }

  return "";
}

function handleGenerate() {

  const settings =
    getGenerationSettings();

  const error =
    validateGenerationSettings(
      settings
    );

  if (error) {

    showToast(error);
    return;
  }

  state.currentYear =
    settings.year;

  state.currentMonth =
    settings.month;

  state.calendarYear =
    settings.year;

  state.calendarMonth =
    settings.month;

  try {

    const result =
      generateMonthSchedule(
        settings.year,
        settings.month,
        settings.startDay,
        settings.endDay
      );

    state.currentOriginalSchedule =
      result.originalSchedule;

    state.currentSchedule =
      result.actualSchedule;

    /*
     * 현재 월 결과를 이력에 저장한다.
     */
    saveCurrentMonthHistory();

    renderSchedule();
    renderBalance();
    renderCalendar();
    renderLeaveList();

    showToast(
      `${settings.year}년 ${settings.month}월 배정표 생성 완료`
    );

  } catch (error) {

    console.error(error);

    showToast(
      error.message ||
      "배정표 생성 중 오류가 발생했습니다."
    );
  }
}


/* ============================================================
 * 테마
 * ============================================================ */

function loadTheme() {

  const theme =
    localStorage.getItem(
      "assignment-theme"
    );

  if (theme === "dark") {
    document.body.classList.add("dark");
  }

  updateThemeButton();
}

function toggleTheme() {

  document.body.classList.toggle("dark");

  const isDark =
    document.body.classList.contains("dark");

  localStorage.setItem(
    "assignment-theme",
    isDark ? "dark" : "light"
  );

  updateThemeButton();
}

function updateThemeButton() {

  const button =
    document.getElementById(
      "theme-toggle"
    );

  const isDark =
    document.body.classList.contains("dark");

  button.textContent =
    isDark
      ? "라이트모드"
      : "다크모드";
}


/* ============================================================
 * Toast
 * ============================================================ */

let toastTimer = null;

function showToast(message) {

  const toast =
    document.getElementById(
      "toast"
    );

  toast.textContent =
    message;

  toast.classList.remove(
    "hidden"
  );

  clearTimeout(toastTimer);

  toastTimer =
    setTimeout(() => {

      toast.classList.add(
        "hidden"
      );

    }, 2800);
}


/* ============================================================
 * 초기화
 * ============================================================ */

async function initializeApp() {

  state.data =
    loadLocalData();

  loadGithubConfigToForm();
  loadTheme();

  /*
   * GitHub 데이터가 있으면 공식 데이터로 사용.
   * 없으면 localStorage 데이터를 사용한다.
   */
  const githubData =
    await loadGithubData();

  if (githubData) {

    state.data =
      githubData;

    saveLocalData();

    showGithubStatus(
      "GitHub의 history.json을 불러왔습니다."
    );
  }

  document.getElementById(
    "calendar-title"
  ).textContent =
    `${state.calendarYear}년 ${state.calendarMonth}월`;

  renderLeaveList();
  renderCalendar();
  renderSchedule();
  renderBalance();
}


/* ============================================================
 * 이벤트
 * ============================================================ */

function bindEvents() {

  document.getElementById(
    "generate-button"
  ).addEventListener(
    "click",
    handleGenerate
  );

  document.getElementById(
    "save-leave-button"
  ).addEventListener(
    "click",
    saveLeave
  );

  document.getElementById(
    "delete-leave-button"
  ).addEventListener(
    "click",
    deleteLeave
  );

  document.getElementById(
    "save-github-settings-button"
  ).addEventListener(
    "click",
    saveGithubSettings
  );

  document.getElementById(
    "prepare-github-button"
  ).addEventListener(
    "click",
    prepareGithubSave
  );

  document.getElementById(
    "export-xlsx-button"
  ).addEventListener(
    "click",
    exportXlsx
  );

  document.getElementById(
    "export-csv-button"
  ).addEventListener(
    "click",
    exportCsv
  );

  document.getElementById(
    "export-json-button"
  ).addEventListener(
    "click",
    exportJson
  );

  document.getElementById(
    "previous-month-button"
  ).addEventListener(
    "click",
    () => changeCalendarMonth(-1)
  );

  document.getElementById(
    "next-month-button"
  ).addEventListener(
    "click",
    () => changeCalendarMonth(1)
  );

  document.getElementById(
    "theme-toggle"
  ).addEventListener(
    "click",
    toggleTheme
  );

  document.getElementById(
    "modal-close-button"
  ).addEventListener(
    "click",
    closeDayModal
  );

  document.getElementById(
    "modal-backdrop"
  ).addEventListener(
    "click",
    closeDayModal
  );

  /*
   * 연도/월을 변경하면 달력도 같이 이동
   */
  document.getElementById(
    "year-input"
  ).addEventListener(
    "change",
    () => {

      const year =
        Number(
          document.getElementById(
            "year-input"
          ).value
        );

      if (
        Number.isInteger(year) &&
        year >= 2020 &&
        year <= 2100
      ) {

        state.calendarYear =
          year;

        renderCalendar();
      }
    }
  );

  document.getElementById(
    "month-input"
  ).addEventListener(
    "change",
    () => {

      const month =
        Number(
          document.getElementById(
            "month-input"
          ).value
        );

      if (
        Number.isInteger(month) &&
        month >= 1 &&
        month <= 12
      ) {

        state.calendarMonth =
          month;

        renderCalendar();
      }
    }
  );
}


/* ============================================================
 * 시작
 * ============================================================ */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    bindEvents();

    initializeApp();
  }
);
