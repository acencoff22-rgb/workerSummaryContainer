"use strict";

/*
 * =========================================================
 * 업무 배정표 자동 생성기
 * =========================================================
 *
 * 기능
 * ---------------------------------------------------------
 * 1. 월 전체 자동 배정
 * 2. 최근 6개월 누적 균형
 * 3. 연차 관리
 * 4. 월간 달력
 * 5. 날짜 상세 모달
 * 6. 텍스트 결과
 * 7. JSON 백업/복원
 * 8. GitHub history.json 읽기
 * 9. GitHub 저장 준비
 * 10. 다크모드
 * =========================================================
 */


/* =========================================================
 * 설정
 * ======================================================= */

const STORAGE_KEY =
  "assignment-app-data-v6";

const GITHUB_CONFIG_KEY =
  "assignment-app-github-config-v1";

const THEME_KEY =
  "assignment-app-theme";

const DATA_VERSION = 7;

const RETENTION_MONTHS = 6;

const BEAM_WIDTH = 3000;

const MAX_STATES_PER_SIGNATURE = 2;


/* =========================================================
 * 작업자
 * ======================================================= */

const WORKERS = [
  "김",
  "탁",
  "임",
  "박",
  "류",
];


/* =========================================================
 * 업무
 * ======================================================= */

const JOBS = [
  "볼분리",
  "볼분리 보조",
  "설거지 및 성형보조",
  "분쇄 및 성형보조",
  "성형 및 분쇄보조",
];


/* =========================================================
 * 업무 제한
 * ======================================================= */

const MAIN_WORKERS = [
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


/* =========================================================
 * 표시 이름 설정
 * ---------------------------------------------------------
 * 내부 계산/이력에는 기존 이름을 그대로 사용하고,
 * 화면에 표시되는 이름만 별도로 변경한다.
 * 따라서 이름을 바꿔도 기존 누적 이력이 깨지지 않는다.
 * ======================================================= */

function createDefaultNameSettings() {
  return {
    workers: Object.fromEntries(
      WORKERS.map((worker) => [worker, worker]),
    ),
    jobs: Object.fromEntries(
      JOBS.map((job) => [job, job]),
    ),
  };
}

function normalizeNameSettings(input) {
  const defaults = createDefaultNameSettings();
  const result = {
    workers: { ...defaults.workers },
    jobs: { ...defaults.jobs },
  };

  if (input && typeof input === "object") {
    if (input.workers && typeof input.workers === "object") {
      for (const worker of WORKERS) {
        const value = String(input.workers[worker] ?? "").trim();
        if (value) {
          result.workers[worker] = value;
        }
      }
    }

    if (input.jobs && typeof input.jobs === "object") {
      for (const job of JOBS) {
        const value = String(input.jobs[job] ?? "").trim();
        if (value) {
          result.jobs[job] = value;
        }
      }
    }
  }

  return result;
}

function getWorkerLabel(worker) {
  return appData?.names?.workers?.[worker] || worker;
}

function getJobLabel(job) {
  return appData?.names?.jobs?.[job] || job;
}


/* =========================================================
 * 전역 상태
 * ======================================================= */

let appData =
  createEmptyData();

let githubConfig =
  createEmptyGithubConfig();

let currentSchedule = [];

let currentOriginalSchedule = [];

let currentOriginalCounts = null;

let copiedText = "";

let calendarYear = 2026;

let calendarMonth = 9;

let selectedDetailDateKey = null;


/* =========================================================
 * 빈 데이터
 * ======================================================= */

function createEmptyWorkerCounts() {
  const result = {};

  for (
    const worker of WORKERS
  ) {
    result[worker] = {};

    for (
      const job of JOBS
    ) {
      result[worker][job] = 0;
    }
  }

  return result;
}


function createEmptyData() {
  return {
    version:
      DATA_VERSION,

    retentionMonths:
      RETENTION_MONTHS,

    baseline:
      createEmptyWorkerCounts(),

    names:
      createDefaultNameSettings(),

    history: {},

    leave: {},
  };
}


function createEmptyGithubConfig() {
  return {
    owner: "",
    repo: "",
    branch: "main",
    dataPath:
      "data/history.json",
  };
}


function deepClone(
  value,
) {
  return JSON.parse(
    JSON.stringify(value),
  );
}


/* =========================================================
 * 데이터 정규화
 * ======================================================= */

function normalizeWorkerCounts(
  input,
) {
  const result =
    createEmptyWorkerCounts();

  if (
    !input ||
    typeof input !==
      "object"
  ) {
    return result;
  }

  for (
    const worker of WORKERS
  ) {
    if (
      !input[worker] ||
      typeof input[worker] !==
        "object"
    ) {
      continue;
    }

    for (
      const job of JOBS
    ) {
      const value =
        Number(
          input[worker][job],
        );

      if (
        Number.isFinite(
          value,
        ) &&
        value >= 0
      ) {
        result[worker][job] =
          Math.floor(value);
      }
    }
  }

  return result;
}


function normalizeLeaveMap(
  input,
) {
  const result = {};

  if (
    !input ||
    typeof input !==
      "object"
  ) {
    return result;
  }

  for (
    const [
      dateKey,
      workers,
    ] of Object.entries(
      input,
    )
  ) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        dateKey,
      )
    ) {
      continue;
    }

    if (
      !Array.isArray(
        workers,
      )
    ) {
      continue;
    }

    result[dateKey] =
      WORKERS.filter(
        (worker) =>
          workers.includes(
            worker,
          ),
      );
  }

  return result;
}


function normalizeHistory(
  history,
) {
  const result = {};

  if (
    !history ||
    typeof history !==
      "object"
  ) {
    return result;
  }

  for (
    const [
      monthKey,
      monthData,
    ] of Object.entries(
      history,
    )
  ) {
    if (
      !/^\d{4}-\d{2}$/.test(
        monthKey,
      )
    ) {
      continue;
    }

    if (
      !monthData ||
      typeof monthData !==
        "object"
    ) {
      continue;
    }

    result[monthKey] = {
      schedule:
        Array.isArray(
          monthData.schedule,
        )
          ? monthData.schedule
          : [],

      originalCounts:
        normalizeWorkerCounts(
          monthData.originalCounts,
        ),

      leave:
        normalizeLeaveMap(
          monthData.leave,
        ),
    };
  }

  return result;
}


function normalizeData(
  input,
) {
  if (
    !input ||
    typeof input !==
      "object"
  ) {
    return createEmptyData();
  }

  return {
    version:
      DATA_VERSION,

    retentionMonths:
      RETENTION_MONTHS,

    baseline:
      normalizeWorkerCounts(
        input.baseline,
      ),

    names:
      normalizeNameSettings(
        input.names,
      ),

    history:
      normalizeHistory(
        input.history,
      ),

    leave:
      normalizeLeaveMap(
        input.leave,
      ),
  };
}


/* =========================================================
 * 로컬 데이터
 * ======================================================= */

function loadLocalData() {
  try {
    const raw =
      localStorage.getItem(
        STORAGE_KEY,
      );

    if (!raw) {
      return false;
    }

    appData =
      normalizeData(
        JSON.parse(raw),
      );

    return true;
  } catch (error) {
    console.error(
      "로컬 데이터 불러오기 실패:",
      error,
    );

    return false;
  }
}


function saveLocalData() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        appData,
      ),
    );

    updateDataStatus();
  } catch (error) {
    console.error(
      "로컬 데이터 저장 실패:",
      error,
    );
  }
}


/* =========================================================
 * GitHub 설정
 * ======================================================= */

function loadGithubConfig() {
  try {
    const raw =
      localStorage.getItem(
        GITHUB_CONFIG_KEY,
      );

    if (!raw) {
      githubConfig =
        createEmptyGithubConfig();

      return;
    }

    githubConfig = {
      ...createEmptyGithubConfig(),
      ...JSON.parse(raw),
    };
  } catch (error) {
    console.error(
      "GitHub 설정 불러오기 실패:",
      error,
    );

    githubConfig =
      createEmptyGithubConfig();
  }
}


function saveGithubConfig() {
  localStorage.setItem(
    GITHUB_CONFIG_KEY,
    JSON.stringify(
      githubConfig,
    ),
  );

  updateGithubForm();

  updateGithubConfigStatus();
}


function readGithubInputs() {
  const owner =
    document.getElementById(
      "githubOwnerInput",
    ).value.trim();

  const repo =
    document.getElementById(
      "githubRepoInput",
    ).value.trim();

  const branch =
    document.getElementById(
      "githubBranchInput",
    ).value.trim() ||
    "main";

  const dataPath =
    document.getElementById(
      "githubDataPathInput",
    ).value.trim() ||
    "data/history.json";

  if (!owner) {
    throw new Error(
      "GitHub 사용자명을 입력해주세요.",
    );
  }

  if (!repo) {
    throw new Error(
      "GitHub 저장소명을 입력해주세요.",
    );
  }

  return {
    owner,

    repo,

    branch,

    dataPath:
      dataPath.replace(
        /^\/+/,
        "",
      ),
  };
}


function updateGithubForm() {
  const owner =
    document.getElementById(
      "githubOwnerInput",
    );

  const repo =
    document.getElementById(
      "githubRepoInput",
    );

  const branch =
    document.getElementById(
      "githubBranchInput",
    );

  const dataPath =
    document.getElementById(
      "githubDataPathInput",
    );

  if (owner) {
    owner.value =
      githubConfig.owner;
  }

  if (repo) {
    repo.value =
      githubConfig.repo;
  }

  if (branch) {
    branch.value =
      githubConfig.branch;
  }

  if (dataPath) {
    dataPath.value =
      githubConfig.dataPath;
  }
}


function updateGithubConfigStatus() {
  const element =
    document.getElementById(
      "githubConfigStatus",
    );

  if (!element) {
    return;
  }

  if (
    !githubConfig.owner ||
    !githubConfig.repo
  ) {
    element.textContent =
      "GitHub 저장소가 설정되지 않았습니다.";

    element.classList.remove(
      "success",
    );

    return;
  }

  element.textContent =
    `저장소: ${githubConfig.owner}/${githubConfig.repo}\n브랜치: ${githubConfig.branch}\n데이터: ${githubConfig.dataPath}`;

  element.classList.add(
    "success",
  );
}


/* =========================================================
 * GitHub URL
 * ======================================================= */

function getGithubRawUrl() {
  if (
    !githubConfig.owner ||
    !githubConfig.repo
  ) {
    return null;
  }

  const path =
    githubConfig.dataPath
      .split("/")
      .map(
        (part) =>
          encodeURIComponent(
            part,
          ),
      )
      .join("/");

  return (
    "https://raw.githubusercontent.com/" +
    encodeURIComponent(
      githubConfig.owner,
    ) +
    "/" +
    encodeURIComponent(
      githubConfig.repo,
    ) +
    "/" +
    encodeURIComponent(
      githubConfig.branch,
    ) +
    "/" +
    path
  );
}


function getGithubEditUrl() {
  if (
    !githubConfig.owner ||
    !githubConfig.repo
  ) {
    return null;
  }

  const path =
    githubConfig.dataPath
      .split("/")
      .map(
        (part) =>
          encodeURIComponent(
            part,
          ),
      )
      .join("/");

  return (
    "https://github.com/" +
    encodeURIComponent(
      githubConfig.owner,
    ) +
    "/" +
    encodeURIComponent(
      githubConfig.repo,
    ) +
    "/edit/" +
    encodeURIComponent(
      githubConfig.branch,
    ) +
    "/" +
    path
  );
}


/* =========================================================
 * GitHub 기록 읽기
 * ======================================================= */

async function loadRepositoryData(
  showAlert = true,
) {
  const status =
    document.getElementById(
      "dataStatus",
    );

  if (
    !githubConfig.owner ||
    !githubConfig.repo
  ) {
    if (status) {
      status.textContent =
        "GitHub 저장소 미설정";
    }

    if (showAlert) {
      alert(
        "먼저 GitHub 저장소 정보를 입력해주세요.",
      );
    }

    return false;
  }

  const rawUrl =
    getGithubRawUrl();

  if (!rawUrl) {
    return false;
  }

  if (status) {
    status.textContent =
      "GitHub 기록 불러오는 중...";
  }

  try {
    const response =
      await fetch(
        `${rawUrl}?t=${Date.now()}`,
        {
          cache:
            "no-store",
        },
      );

    if (
      response.status ===
      404
    ) {
      if (status) {
        status.textContent =
          "GitHub history.json 없음";
      }

      if (showAlert) {
        alert(
          "GitHub 저장소에 history.json이 없습니다.",
        );
      }

      return false;
    }

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`,
      );
    }

    appData =
      normalizeData(
        await response.json(),
      );

    saveLocalData();

    renderLeaveList();

    renderCalendar();

    updateDataStatus();

    if (status) {
      status.textContent =
        "GitHub 기록 불러오기 완료";
    }

    if (showAlert) {
      alert(
        "GitHub 저장소의 기록을 불러왔습니다.",
      );
    }

    return true;
  } catch (error) {
    console.error(
      "GitHub 기록 불러오기 실패:",
      error,
    );

    if (status) {
      status.textContent =
        "GitHub 기록 불러오기 실패";
    }

    if (showAlert) {
      alert(
        "GitHub 기록을 불러오지 못했습니다.",
      );
    }

    return false;
  }
}


/* =========================================================
 * 날짜/월
 * ======================================================= */

function getDateInfo(
  year,
  month,
  day,
) {
  const date =
    new Date(
      year,
      month - 1,
      day,
    );

  return {
    year:
      date.getFullYear(),

    month:
      date.getMonth() + 1,

    day:
      date.getDate(),

    weekday:
      date.getDay(),
  };
}


function getDaysInMonth(
  year,
  month,
) {
  return new Date(
    year,
    month,
    0,
  ).getDate();
}


function formatDateKey(
  year,
  month,
  day,
) {
  return [
    String(year).padStart(
      4,
      "0",
    ),

    String(month).padStart(
      2,
      "0",
    ),

    String(day).padStart(
      2,
      "0",
    ),
  ].join("-");
}


function getMonthKey(
  year,
  month,
) {
  return (
    `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`
  );
}


function parseMonthKey(
  key,
) {
  const match =
    /^(\d{4})-(\d{2})$/.exec(
      key,
    );

  if (!match) {
    return null;
  }

  return {
    year:
      Number(match[1]),

    month:
      Number(match[2]),
  };
}


function addMonths(
  year,
  month,
  offset,
) {
  const date =
    new Date(
      year,
      month - 1 + offset,
      1,
    );

  return {
    year:
      date.getFullYear(),

    month:
      date.getMonth() + 1,
  };
}


function getRollingMonthKeys(
  year,
  month,
) {
  const result = [];

  for (
    let offset =
      -(RETENTION_MONTHS - 1);
    offset <= 0;
    offset += 1
  ) {
    const date =
      addMonths(
        year,
        month,
        offset,
      );

    result.push(
      getMonthKey(
        date.year,
        date.month,
      ),
    );
  }

  return result;
}


/* =========================================================
 * 업무 제한
 * ======================================================= */

function isAllowed(
  worker,
  job,
) {
  if (
    job === "볼분리" ||
    job === "볼분리 보조"
  ) {
    return MAIN_WORKERS.includes(
      worker,
    );
  }

  if (
    worker === "박"
  ) {
    return PARK_ALLOWED_JOBS.includes(
      job,
    );
  }

  if (
    worker === "류"
  ) {
    return LIU_JOBS.includes(
      job,
    );
  }

  return true;
}


/* =========================================================
 * 순열
 * ======================================================= */

function generatePermutations(
  items,
) {
  if (
    items.length <= 1
  ) {
    return [
      items.slice(),
    ];
  }

  const result = [];

  for (
    let i = 0;
    i < items.length;
    i += 1
  ) {
    const current =
      items[i];

    const remaining = [
      ...items.slice(
        0,
        i,
      ),

      ...items.slice(
        i + 1,
      ),
    ];

    const children =
      generatePermutations(
        remaining,
      );

    for (
      const child of children
    ) {
      result.push([
        current,
        ...child,
      ]);
    }
  }

  return result;
}


/* =========================================================
 * 하루 후보
 * ======================================================= */

function generateDailyCandidates() {
  const result = [];

  const permutations =
    generatePermutations(
      WORKERS,
    );

  for (
    const workerOrder
      of permutations
  ) {
    const candidate = {};

    let valid = true;

    for (
      let i = 0;
      i < JOBS.length;
      i += 1
    ) {
      const job =
        JOBS[i];

      const worker =
        workerOrder[i];

      if (
        !isAllowed(
          worker,
          job,
        )
      ) {
        valid = false;
        break;
      }

      candidate[job] =
        worker;
    }

    if (!valid) {
      continue;
    }

    result.push(
      candidate,
    );
  }

  return result;
}


/* =========================================================
 * 카운트
 * ======================================================= */

function createEmptyJobCounts() {
  const result = {};

  for (
    const job of JOBS
  ) {
    result[job] = 0;
  }

  return result;
}


function normalizeWorkerCounts(
  input,
) {
  const result =
    createEmptyWorkerCounts();

  if (
    !input ||
    typeof input !==
      "object"
  ) {
    return result;
  }

  for (
    const worker of WORKERS
  ) {
    for (
      const job of JOBS
    ) {
      const value =
        Number(
          input[worker]?.[job] ??
            0,
        );

      if (
        Number.isFinite(
          value,
        ) &&
        value >= 0
      ) {
        result[worker][job] =
          Math.floor(value);
      }
    }
  }

  return result;
}


function addWorkerCounts(
  base,
  extra,
) {
  const result =
    normalizeWorkerCounts(
      base,
    );

  const source =
    normalizeWorkerCounts(
      extra,
    );

  for (
    const worker of WORKERS
  ) {
    for (
      const job of JOBS
    ) {
      result[worker][job] +=
        source[worker][job];
    }
  }

  return result;
}


function addAssignmentToCounts(
  counts,
  assignment,
) {
  const result =
    normalizeWorkerCounts(
      counts,
    );

  for (
    const job of JOBS
  ) {
    const worker =
      assignment[job];

    if (!worker) {
      continue;
    }

    result[worker][job] +=
      1;
  }

  return result;
}


function calculateOriginalCounts(
  schedule,
) {
  const result =
    createEmptyWorkerCounts();

  for (
    const day of schedule
  ) {
    for (
      const job of JOBS
    ) {
      const worker =
        day[job];

      if (!worker) {
        continue;
      }

      result[worker][job] +=
        1;
    }
  }

  return result;
}


/* =========================================================
 * 누적 시작값
 * ======================================================= */

function getStartingCounts(
  year,
  month,
) {
  let counts =
    normalizeWorkerCounts(
      appData.baseline,
    );

  const target =
    getMonthKey(
      year,
      month,
    );

  const keys =
    Object.keys(
      appData.history,
    ).sort(
      (a, b) =>
        a.localeCompare(b),
    );

  for (
    const key of keys
  ) {
    if (
      key === target
    ) {
      continue;
    }

    const monthData =
      appData.history[
        key
      ];

    if (
      !monthData?.originalCounts
    ) {
      continue;
    }

    counts =
      addWorkerCounts(
        counts,
        monthData.originalCounts,
      );
  }

  return counts;
}


/* =========================================================
 * 범위
 * ======================================================= */

function getRange(
  values,
) {
  if (
    !values.length
  ) {
    return 0;
  }

  return (
    Math.max(...values) -
    Math.min(...values)
  );
}


/* =========================================================
 * 점수
 * ======================================================= */

function getBowlCounts(
  counts,
) {
  return MAIN_WORKERS.map(
    (worker) =>
      counts[worker][
        "볼분리"
      ],
  );
}


function getBowlHelperCounts(
  counts,
) {
  return MAIN_WORKERS.map(
    (worker) =>
      counts[worker][
        "볼분리 보조"
      ],
  );
}


function getLiuCounts(
  counts,
) {
  return LIU_JOBS.map(
    (job) =>
      counts["류"][job],
  );
}


function getParkCounts(
  counts,
) {
  return PARK_ALLOWED_JOBS.map(
    (job) =>
      counts["박"][job],
  );
}


function getMainExtraCounts(
  counts,
) {
  return MAIN_WORKERS.map(
    (worker) => {
      let total = 0;

      for (
        const job of LIU_JOBS
      ) {
        total +=
          counts[worker][job];
      }

      return total;
    },
  );
}


function calculateFullConsecutivePenalty(
  schedule,
) {
  if (
    schedule.length < 2
  ) {
    return 0;
  }

  let penalty = 0;

  for (
    let i = 1;
    i < schedule.length;
    i += 1
  ) {
    const previous =
      schedule[i - 1];

    const current =
      schedule[i];

    for (
      const worker of WORKERS
    ) {
      const previousJob =
        getJobForWorker(
          previous,
          worker,
        );

      const currentJob =
        getJobForWorker(
          current,
          worker,
        );

      if (
        previousJob &&
        previousJob ===
          currentJob
      ) {
        penalty += 1;
      }
    }
  }

  return penalty;
}


function calculatePartialScore(
  state,
) {
  const counts =
    state.counts;

  return (
    getRange(
      getBowlCounts(
        counts,
      ),
    ) * 1000000 +

    getRange(
      getBowlHelperCounts(
        counts,
      ),
    ) * 100000 +

    getRange(
      getLiuCounts(
        counts,
      ),
    ) * 10000 +

    getRange(
      getMainExtraCounts(
        counts,
      ),
    ) * 1000 +

    getRange(
      getParkCounts(
        counts,
      ),
    ) * 500 +

    calculateFullConsecutivePenalty(
      state.schedule,
    ) * 10
  );
}


function calculateFinalScore(
  state,
) {
  const counts =
    state.counts;

  const bowlRange =
    getRange(
      getBowlCounts(
        counts,
      ),
    );

  const helperRange =
    getRange(
      getBowlHelperCounts(
        counts,
      ),
    );

  const liuCounts =
    getLiuCounts(
      counts,
    );

  const liuRange =
    getRange(
      liuCounts,
    );

  const parkCounts =
    getParkCounts(
      counts,
    );

  const parkRange =
    getRange(
      parkCounts,
    );

  const mainExtraRange =
    getRange(
      getMainExtraCounts(
        counts,
      ),
    );

  let mainJobSpread = 0;

  for (
    const job of JOBS
  ) {
    mainJobSpread +=
      getRange(
        MAIN_WORKERS.map(
          (worker) =>
            counts[worker][job],
        ),
      );
  }

  const liuAverage =
    liuCounts.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) /
    liuCounts.length;

  const liuVariance =
    liuCounts.reduce(
      (sum, value) =>
        sum +
        Math.pow(
          value -
            liuAverage,
          2,
        ),
      0,
    );

  const parkAverage =
    parkCounts.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) /
    parkCounts.length;

  const parkVariance =
    parkCounts.reduce(
      (sum, value) =>
        sum +
        Math.pow(
          value -
            parkAverage,
          2,
        ),
      0,
    );

  const consecutive =
    calculateFullConsecutivePenalty(
      state.schedule,
    );

  return (
    bowlRange * 1000000000 +
    helperRange * 100000000 +
    liuRange * 10000000 +
    parkRange * 1000000 +
    mainExtraRange * 100000 +
    mainJobSpread * 10000 +
    liuVariance * 1000 +
    parkVariance * 100 +
    consecutive
  );
}


/* =========================================================
 * 상태 시그니처
 * ======================================================= */

function createStateSignature(
  state,
) {
  const counts =
    state.counts;

  const bowl =
    getBowlCounts(
      counts,
    ).join(",");

  const helper =
    getBowlHelperCounts(
      counts,
    ).join(",");

  const liu =
    getLiuCounts(
      counts,
    ).join(",");

  const park =
    getParkCounts(
      counts,
    ).join(",");

  const main =
    getMainExtraCounts(
      counts,
    ).join(",");

  let last = "";

  if (
    state.lastAssignment
  ) {
    last =
      JOBS.map(
        (job) =>
          state.lastAssignment[
            job
          ],
      ).join(",");
  }

  return [
    bowl,
    helper,
    liu,
    park,
    main,
    last,
  ].join("|");
}


/* =========================================================
 * 가지치기
 * ======================================================= */

function pruneStates(
  states,
) {
  const grouped =
    new Map();

  for (
    const state of states
  ) {
    const signature =
      createStateSignature(
        state,
      );

    const score =
      calculatePartialScore(
        state,
      );

    const group =
      grouped.get(
        signature,
      ) || [];

    group.push({
      state,
      score,
    });

    group.sort(
      (a, b) =>
        a.score -
        b.score,
    );

    if (
      group.length >
      MAX_STATES_PER_SIGNATURE
    ) {
      group.length =
        MAX_STATES_PER_SIGNATURE;
    }

    grouped.set(
      signature,
      group,
    );
  }

  const flattened = [];

  for (
    const group of grouped.values()
  ) {
    flattened.push(
      ...group,
    );
  }

  flattened.sort(
    (a, b) =>
      a.score -
      b.score,
  );

  return flattened
    .slice(
      0,
      BEAM_WIDTH,
    )
    .map(
      (item) =>
        item.state,
    );
}


/* =========================================================
 * 월 전체 최적화
 * ======================================================= */

function optimizeMonth(
  year,
  month,
  startDay,
  endDay,
  startingCounts,
) {
  const dailyCandidates =
    generateDailyCandidates();

  if (
    dailyCandidates.length === 0
  ) {
    throw new Error(
      "현재 규칙으로 가능한 하루 배정이 없습니다.",
    );
  }

  const dates = [];

  for (
    let day = startDay;
    day <= endDay;
    day += 1
  ) {
    dates.push(
      getDateInfo(
        year,
        month,
        day,
      ),
    );
  }

  let states = [
    {
      schedule: [],

      counts:
        normalizeWorkerCounts(
          startingCounts,
        ),

      lastAssignment:
        null,
    },
  ];

  for (
    let index = 0;
    index < dates.length;
    index += 1
  ) {
    const nextStates = [];

    for (
      const state of states
    ) {
      for (
        const candidate of
          dailyCandidates
      ) {
        nextStates.push({
          schedule: [
            ...state.schedule,

            {
              ...dates[index],
              ...candidate,
            },
          ],

          counts:
            addAssignmentToCounts(
              state.counts,
              candidate,
            ),

          lastAssignment:
            candidate,
        });
      }
    }

    states =
      pruneStates(
        nextStates,
      );
  }

  states.sort(
    (a, b) =>
      calculateFinalScore(a) -
      calculateFinalScore(b),
  );

  return states[0].schedule;
}


/* =========================================================
 * 검증
 * ======================================================= */

function validateOriginalSchedule(
  schedule,
) {
  const errors = [];

  for (
    const day of schedule
  ) {
    const assignedWorkers =
      JOBS.map(
        (job) =>
          day[job],
      );

    if (
      assignedWorkers.some(
        (worker) =>
          !worker,
      )
    ) {
      errors.push(
        `${day.month}월 ${day.day}일: 미배정 업무`,
      );

      continue;
    }

    if (
      new Set(
        assignedWorkers,
      ).size !== 5
    ) {
      errors.push(
        `${day.month}월 ${day.day}일: 작업자 중복`,
      );
    }

    for (
      const job of JOBS
    ) {
      if (
        !isAllowed(
          day[job],
          job,
        )
      ) {
        errors.push(
          `${day.month}월 ${day.day}일: ${getWorkerLabel(day[job])} → ${getJobLabel(job)} 규칙 위반`,
        );
      }
    }
  }

  return errors;
}


/* =========================================================
 * 작업자 업무
 * ======================================================= */

function getJobForWorker(
  day,
  worker,
) {
  for (
    const job of JOBS
  ) {
    if (
      day?.[job] === worker
    ) {
      return job;
    }
  }

  return null;
}


/* =========================================================
 * 연차
 * ======================================================= */

function getLeaveWorkers(
  dateKey,
) {
  return [
    ...(
      appData.leave[
        dateKey
      ] || []
    ),
  ];
}


function setLeaveWorkers(
  dateKey,
  workers,
) {
  const normalized =
    WORKERS.filter(
      (worker) =>
        workers.includes(
          worker,
        ),
    );

  if (
    normalized.length === 0
  ) {
    delete appData.leave[
      dateKey
    ];
  } else {
    appData.leave[
      dateKey
    ] = normalized;
  }

  saveLocalData();

  renderLeaveList();

  renderCalendar();

  /*
   * 현재 열려 있는 상세창이 있다면
   * 연차 표시를 즉시 갱신한다.
   */
  if (
    selectedDetailDateKey
  ) {
    openDayDetail(
      selectedDetailDateKey,
      false,
    );
  }
}


function getLeaveMapForMonth(
  year,
  month,
) {
  const prefix =
    getMonthKey(
      year,
      month,
    );

  const result = {};

  for (
    const [
      dateKey,
      workers,
    ] of Object.entries(
      appData.leave,
    )
  ) {
    if (
      dateKey.startsWith(
        `${prefix}-`,
      )
    ) {
      result[dateKey] =
        [...workers];
    }
  }

  return result;
}


/* =========================================================
 * 달력
 * ======================================================= */

function renderCalendar() {
  const container =
    document.getElementById(
      "calendarContainer",
    );

  const title =
    document.getElementById(
      "calendarTitle",
    );

  if (
    !container ||
    !title
  ) {
    return;
  }

  title.textContent =
    `${calendarYear}년 ${calendarMonth}월`;

  if (
    currentOriginalSchedule.length === 0
  ) {
    container.innerHTML = `
      <div class="empty-state">
        ${calendarYear}년 ${calendarMonth}월 배정표를 생성하면 달력에 표시됩니다.
      </div>
    `;

    return;
  }

  const scheduleMap =
    new Map();

  for (
    const day of currentSchedule
  ) {
    const key =
      formatDateKey(
        day.year,
        day.month,
        day.day,
      );

    scheduleMap.set(
      key,
      day,
    );
  }

  const firstDate =
    new Date(
      calendarYear,
      calendarMonth - 1,
      1,
    );

  const firstWeekday =
    firstDate.getDay();

  const daysInMonth =
    getDaysInMonth(
      calendarYear,
      calendarMonth,
    );

  const calendar =
    document.createElement(
      "div",
    );

  calendar.className =
    "calendar";

  const weekdays = [
    "일",
    "월",
    "화",
    "수",
    "목",
    "금",
    "토",
  ];

  for (
    let i = 0;
    i < 7;
    i += 1
  ) {
    const header =
      document.createElement(
        "div",
      );

    header.className =
      "calendar-weekday";

    if (i === 0) {
      header.classList.add(
        "sunday",
      );
    }

    if (i === 6) {
      header.classList.add(
        "saturday",
      );
    }

    header.textContent =
      weekdays[i];

    calendar.appendChild(
      header,
    );
  }

  for (
    let i = 0;
    i < firstWeekday;
    i += 1
  ) {
    const empty =
      document.createElement(
        "div",
      );

    empty.className =
      "calendar-day empty";

    calendar.appendChild(
      empty,
    );
  }

  const today =
    new Date();

  for (
    let dayNumber = 1;
    dayNumber <= daysInMonth;
    dayNumber += 1
  ) {
    const key =
      formatDateKey(
        calendarYear,
        calendarMonth,
        dayNumber,
      );

    const actualDay =
      scheduleMap.get(
        key,
      );

    const cell =
      document.createElement(
        "div",
      );

    cell.className =
      "calendar-day";

    const weekday =
      new Date(
        calendarYear,
        calendarMonth - 1,
        dayNumber,
      ).getDay();

    if (
      weekday === 0 ||
      weekday === 6
    ) {
      cell.classList.add(
        "weekend",
      );
    }

    if (
      today.getFullYear() ===
        calendarYear &&
      today.getMonth() + 1 ===
        calendarMonth &&
      today.getDate() ===
        dayNumber
    ) {
      cell.classList.add(
        "today",
      );
    }

    const leaveWorkers =
      actualDay?.leaveWorkers ||
      getLeaveWorkers(
        key,
      );

    if (
      leaveWorkers.length > 0
    ) {
      cell.classList.add(
        "leave",
      );
    }

    const dateHeader =
      document.createElement(
        "div",
      );

    dateHeader.className =
      "calendar-date";

    const dateNumber =
      document.createElement(
        "span",
      );

    dateNumber.className =
      "calendar-date-number";

    dateNumber.textContent =
      String(
        dayNumber,
      );

    dateHeader.appendChild(
      dateNumber,
    );

    if (
      leaveWorkers.length > 0
    ) {
      const leaveLabel =
        document.createElement(
          "span",
        );

      leaveLabel.className =
        "calendar-leave-label";

      leaveLabel.textContent =
        "연차";

      dateHeader.appendChild(
        leaveLabel,
      );
    }

    cell.appendChild(
      dateHeader,
    );

    const assignment =
      document.createElement(
        "div",
      );

    assignment.className =
      "calendar-assignment";

    if (actualDay) {
      for (
        const worker of WORKERS
      ) {
        const row =
          document.createElement(
            "div",
          );

        row.className =
          "calendar-worker";

        const name =
          document.createElement(
            "span",
          );

        name.className =
          "calendar-worker-name";

        name.textContent =
          getWorkerLabel(worker);

        const jobElement =
          document.createElement(
            "span",
          );

        jobElement.className =
          "calendar-worker-job";

        if (
          leaveWorkers.includes(
            worker,
          )
        ) {
          jobElement.textContent =
            "연차";

          jobElement.classList.add(
            "leave",
          );
        } else {
          const job =
            getJobForWorker(
              actualDay,
              worker,
            );

          jobElement.textContent =
            job ? getJobLabel(job) : "미배정";
        }

        row.appendChild(
          name,
        );

        row.appendChild(
          jobElement,
        );

        assignment.appendChild(
          row,
        );
      }
    } else {
      const message =
        document.createElement(
          "div",
        );

      message.className =
        "calendar-worker-job";

      message.textContent =
        "미생성";

      assignment.appendChild(
        message,
      );
    }

    cell.appendChild(
      assignment,
    );

    /*
     * 날짜 클릭
     */
    cell.addEventListener(
      "click",
      () => {
        openDayDetail(
          key,
          true,
        );
      },
    );

    calendar.appendChild(
      cell,
    );
  }

  const totalCells =
    firstWeekday +
    daysInMonth;

  const remainder =
    totalCells % 7;

  if (
    remainder !== 0
  ) {
    for (
      let i = remainder;
      i < 7;
      i += 1
    ) {
      const empty =
        document.createElement(
          "div",
        );

      empty.className =
        "calendar-day empty";

      calendar.appendChild(
        empty,
      );
    }
  }

  container.innerHTML =
    "";

  container.appendChild(
    calendar,
  );
}


/* =========================================================
 * 날짜 상세 모달
 * ======================================================= */

function openDayDetail(
  dateKey,
  scrollToLeave,
) {
  selectedDetailDateKey =
    dateKey;

  const modal =
    document.getElementById(
      "dayDetailModal",
    );

  const title =
    document.getElementById(
      "dayDetailTitle",
    );

  const body =
    document.getElementById(
      "dayDetailBody",
    );

  if (
    !modal ||
    !title ||
    !body
  ) {
    return;
  }

  const dateParts =
    dateKey
      .split("-")
      .map(Number);

  const year =
    dateParts[0];

  const month =
    dateParts[1];

  const day =
    dateParts[2];

  const dateInfo =
    getDateInfo(
      year,
      month,
      day,
    );

  title.textContent =
    `${year}년 ${month}월 ${day}일 (${getWeekdayName(dateInfo.weekday)})`;

  const actualDay =
    currentSchedule.find(
      (item) =>
        item.year === year &&
        item.month === month &&
        item.day === day,
    );

  const originalDay =
    currentOriginalSchedule.find(
      (item) =>
        item.year === year &&
        item.month === month &&
        item.day === day,
    );

  const leaveWorkers =
    getLeaveWorkers(
      dateKey,
    );

  const parts = [];

  parts.push(
    createDetailAssignmentHtml(
      actualDay,
      originalDay,
      leaveWorkers,
    ),
  );

  if (
    leaveWorkers.length > 0
  ) {
    parts.push(
      `
      <div class="detail-section">
        <h3 class="detail-section-title">
          연차자
        </h3>

        <div class="leave-detail-list">
          ${leaveWorkers
            .map(
              (worker) =>
                `<span class="leave-badge active">${escapeHtml(getWorkerLabel(worker))}</span>`,
            )
            .join("")}
        </div>
      </div>
      `,
    );
  } else {
    parts.push(
      `
      <div class="detail-section">
        <h3 class="detail-section-title">
          연차
        </h3>

        <div class="detail-note">
          연차자가 없습니다.
        </div>
      </div>
      `,
    );
  }

  body.innerHTML =
    parts.join("");


  modal.hidden =
    false;

  document.body.classList.add(
    "modal-open",
  );


  if (
    scrollToLeave
  ) {
    const leaveInput =
      document.getElementById(
        "leaveDateInput",
      );

    if (leaveInput) {
      leaveInput.value =
        dateKey;

      loadLeaveCheckboxes(
        dateKey,
      );
    }
  }
}


function createDetailAssignmentHtml(
  actualDay,
  originalDay,
  leaveWorkers,
) {
  if (
    !originalDay
  ) {
    return `
      <div class="detail-note">
        아직 이 날짜의 배정표가 생성되지 않았습니다.
      </div>
    `;
  }

  const rows = [];

  for (
    const worker of WORKERS
  ) {
    const row =
      document.createElement(
        "div",
      );

    const originalJob =
      getJobForWorker(
        originalDay,
        worker,
      );

    const actualJob =
      actualDay
        ? getJobForWorker(
            actualDay,
            worker,
          )
        : null;

    let jobText =
      actualJob ||
      "미배정";

    let className =
      "detail-job";

    if (
      leaveWorkers.includes(
        worker,
      )
    ) {
      jobText =
        originalJob
          ? `연차 (원래 ${getJobLabel(originalJob)})`
          : "연차";

      className +=
        " leave";
    }

    rows.push(
      `
        <div class="detail-row">
          <span class="detail-worker">
            ${escapeHtml(getWorkerLabel(worker))}
          </span>

          <span class="${className}">
            ${escapeHtml(jobText)}
          </span>
        </div>
      `,
    );
  }

  return `
    <div class="detail-section">

      <h3 class="detail-section-title">
        당일 배정
      </h3>

      <div class="detail-list">
        ${rows.join("")}
      </div>

    </div>
  `;
}


function closeDayDetail() {
  const modal =
    document.getElementById(
      "dayDetailModal",
    );

  if (modal) {
    modal.hidden =
      true;
  }

  document.body.classList.remove(
    "modal-open",
  );

  selectedDetailDateKey =
    null;
}


function handleDayDetailLeave() {
  if (
    !selectedDetailDateKey
  ) {
    return;
  }

  const input =
    document.getElementById(
      "leaveDateInput",
    );

  if (input) {
    input.value =
      selectedDetailDateKey;

    loadLeaveCheckboxes(
      selectedDetailDateKey,
    );

    closeDayDetail();

    input.scrollIntoView({
      behavior:
        "smooth",

      block:
        "center",
    });
  }
}


function loadLeaveCheckboxes(
  dateKey,
) {
  const workers =
    getLeaveWorkers(
      dateKey,
    );

  document
    .querySelectorAll(
      "[data-leave-worker]",
    )
    .forEach(
      (checkbox) => {
        checkbox.checked =
          workers.includes(
            checkbox.value,
          );
      },
    );
}


/* =========================================================
 * 달력 월 이동
 * ======================================================= */

function moveCalendarMonth(
  offset,
) {
  const date =
    new Date(
      calendarYear,
      calendarMonth - 1 + offset,
      1,
    );

  calendarYear =
    date.getFullYear();

  calendarMonth =
    date.getMonth() + 1;

  renderCalendar();
}


function updateCalendarToGeneratedMonth() {
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

  if (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12
  ) {
    calendarYear =
      year;

    calendarMonth =
      month;
  }
}


/* =========================================================
 * 연차 목록
 * ======================================================= */

function renderLeaveList() {
  const container =
    document.getElementById(
      "leaveList",
    );

  if (!container) {
    return;
  }

  const entries =
    Object.entries(
      appData.leave,
    ).sort(
      (a, b) =>
        a[0].localeCompare(
          b[0],
        ),
    );

  if (
    entries.length === 0
  ) {
    container.innerHTML = `
      <div class="empty-state">
        등록된 연차가 없습니다.
      </div>
    `;

    return;
  }

  container.innerHTML =
    "";

  for (
    const [
      dateKey,
      workers,
    ] of entries
  ) {
    const item =
      document.createElement(
        "div",
      );

    item.className =
      "leave-item";


    const main =
      document.createElement(
        "div",
      );

    main.className =
      "leave-item-main";


    const date =
      document.createElement(
        "div",
      );

    date.className =
      "leave-date";

    date.textContent =
      formatDisplayDate(
        dateKey,
      );


    const workersText =
      document.createElement(
        "div",
      );

    workersText.className =
      "leave-workers";

    workersText.textContent =
      workers.map(getWorkerLabel).join(
        " · ",
      );


    main.appendChild(
      date,
    );

    main.appendChild(
      workersText,
    );


    const deleteButton =
      document.createElement(
        "button",
      );

    deleteButton.type =
      "button";

    deleteButton.className =
      "leave-delete-button";

    deleteButton.textContent =
      "삭제";


    deleteButton.addEventListener(
      "click",
      () => {
        delete appData.leave[
          dateKey
        ];

        saveLocalData();

        renderLeaveList();
        renderCalendar();
      },
    );


    item.appendChild(
      main,
    );

    item.appendChild(
      deleteButton,
    );


    container.appendChild(
      item,
    );
  }
}


function formatDisplayDate(
  dateKey,
) {
  const date =
    new Date(
      `${dateKey}T00:00:00`,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return dateKey;
  }

  return (
    `${date.getFullYear()}년 ` +
    `${date.getMonth() + 1}월 ` +
    `${date.getDate()}일 ` +
    `(${getWeekdayName(
      date.getDay(),
    )})`
  );
}


/* =========================================================
 * 배정 결과 텍스트
 * ======================================================= */

function formatScheduleAsText(
  schedule,
) {
  if (
    !schedule ||
    schedule.length === 0
  ) {
    return "";
  }

  const first =
    schedule[0];

  const lines = [];

  lines.push(
    `${first.year}년 ${first.month}월 업무 배정표`,
  );

  lines.push("");

  for (
    const day of schedule
  ) {
    const dateKey =
      formatDateKey(
        day.year,
        day.month,
        day.day,
      );

    const leaveWorkers =
      getLeaveWorkers(
        dateKey,
      );

    lines.push(
      `### ${day.month}월 ${day.day}일`,
    );

    for (
      const worker of WORKERS
    ) {
      if (
        leaveWorkers.includes(
          worker,
        )
      ) {
        const originalJob =
          getJobForWorker(
            day,
            worker,
          );

        lines.push(
          `${getWorkerLabel(worker)} → 연차${
            originalJob
              ? ` (원래 ${getJobLabel(originalJob)})`
              : ""
          }`,
        );

        continue;
      }

      const job =
        getJobForWorker(
          day,
          worker,
        );

      lines.push(
        `${getWorkerLabel(worker)} → ${
          job ? getJobLabel(job) : "미배정"
        }`,
      );
    }

    lines.push("");
  }

  return lines.join(
    "\n",
  );
}


/* =========================================================
 * 자동 배정
 * ======================================================= */

function handleGenerate() {
  let inputs;

  try {
    inputs =
      readDateInputs();
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "입력값을 확인해주세요.",
    );

    return;
  }

  const status =
    document.getElementById(
      "statusText",
    );

  if (status) {
    status.textContent =
      "월 전체 최적화 중...";

    status.classList.remove(
      "success",
    );
  }

  window.setTimeout(
    () => {
      try {
        const {
          year,
          month,
          startDay,
          endDay,
        } = inputs;

        updateCalendarToGeneratedMonth();

        cleanupOldHistory(
          year,
          month,
        );

        const startingCounts =
          getStartingCounts(
            year,
            month,
          );

        const schedule =
          optimizeMonth(
            year,
            month,
            startDay,
            endDay,
            startingCounts,
          );

        currentOriginalSchedule =
          schedule;

        currentOriginalCounts =
          calculateOriginalCounts(
            schedule,
          );

        currentSchedule =
          schedule.map(
            (day) => ({
              ...day,

              leaveWorkers:
                getLeaveWorkers(
                  formatDateKey(
                    day.year,
                    day.month,
                    day.day,
                  ),
                ),
            }),
          );

        const monthKey =
          getMonthKey(
            year,
            month,
          );

        appData.history[
          monthKey
        ] = {
          schedule:
            deepClone(
              schedule,
            ),

          originalCounts:
            deepClone(
              currentOriginalCounts,
            ),

          leave:
            getLeaveMapForMonth(
              year,
              month,
            ),
        };

        cleanupOldHistory(
          year,
          month,
        );

        saveLocalData();

        renderSchedule();
        renderCalendar();
      } catch (error) {
        console.error(
          error,
        );

        if (status) {
          status.textContent =
            "배정 실패";

          status.classList.remove(
            "success",
          );
        }

        alert(
          error instanceof Error
            ? error.message
            : "배정표 생성 중 오류가 발생했습니다.",
        );
      }
    },
    20,
  );
}


/* =========================================================
 * 입력
 * ======================================================= */

function readDateInputs() {
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
    getDaysInMonth(
      year,
      month,
    );

  if (
    startDay < 1 ||
    startDay >
      daysInMonth
  ) {
    throw new Error(
      "시작일이 올바르지 않습니다.",
    );
  }

  if (
    endDay < 1 ||
    endDay >
      daysInMonth
  ) {
    throw new Error(
      "종료일이 올바르지 않습니다.",
    );
  }

  if (
    startDay > endDay
  ) {
    throw new Error(
      "시작일은 종료일보다 클 수 없습니다.",
    );
  }

  return {
    year,
    month,
    startDay,
    endDay,
  };
}


/* =========================================================
 * 오래된 기록 정리
 * ======================================================= */

function cleanupOldHistory(
  referenceYear,
  referenceMonth,
) {
  const keys =
    Object.keys(
      appData.history,
    ).sort(
      (a, b) =>
        a.localeCompare(b),
    );

  if (
    keys.length === 0
  ) {
    return;
  }

  const keep =
    new Set(
      getRollingMonthKeys(
        referenceYear,
        referenceMonth,
      ),
    );

  for (
    const key of keys
  ) {
    if (
      keep.has(key)
    ) {
      continue;
    }

    const monthData =
      appData.history[
        key
      ];

    if (
      monthData &&
      monthData.originalCounts
    ) {
      appData.baseline =
        addWorkerCounts(
          appData.baseline,
          monthData.originalCounts,
        );
    }

    delete appData.history[
      key
    ];
  }

  saveLocalData();
}


/* =========================================================
 * 렌더링
 * ======================================================= */

function renderSchedule() {
  const result =
    document.getElementById(
      "resultText",
    );

  const status =
    document.getElementById(
      "statusText",
    );

  const errors =
    validateOriginalSchedule(
      currentOriginalSchedule,
    );

  copiedText =
    formatScheduleAsText(
      currentSchedule,
    );

  if (result) {
    result.textContent =
      copiedText;

    if (
      errors.length > 0
    ) {
      result.textContent +=
        "\n\n[검증 오류]\n" +
        errors.join("\n");
    }
  }

  if (status) {
    if (
      errors.length === 0
    ) {
      status.textContent =
        `${currentOriginalSchedule.length}일 생성 완료 · 월 전체 최적화 · 규칙 검증 통과`;

      status.classList.add(
        "success",
      );
    } else {
      status.textContent =
        `검증 오류 ${errors.length}건`;

      status.classList.remove(
        "success",
      );
    }
  }

  renderJobSummary();
  renderWorkerSummary();
  renderCalendar();
  updateDataStatus();
}


/* =========================================================
 * 업무 요약
 * ======================================================= */

function renderJobSummary() {
  const container =
    document.getElementById(
      "summaryContainer",
    );

  if (!container) {
    return;
  }

  const counts =
    createEmptyJobCounts();

  for (
    const day of currentOriginalSchedule
  ) {
    for (
      const job of JOBS
    ) {
      if (day[job]) {
        counts[job] += 1;
      }
    }
  }

  container.innerHTML =
    "";

  for (
    const job of JOBS
  ) {
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

    label.className =
      "label";

    label.textContent =
      getJobLabel(job);

    const value =
      document.createElement(
        "span",
      );

    value.className =
      "value";

    value.textContent =
      `${counts[job]}회`;

    card.appendChild(
      label,
    );

    card.appendChild(
      value,
    );

    container.appendChild(
      card,
    );
  }
}


/* =========================================================
 * 작업자 요약
 * ======================================================= */

function renderWorkerSummary() {
  const container =
    document.getElementById(
      "workerSummaryContainer",
    );

  if (!container) {
    return;
  }

  const counts =
    currentOriginalCounts ||
    createEmptyWorkerCounts();

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

  const header =
    document.createElement(
      "tr",
    );

  [
    "작업자",
    getJobLabel("볼분리"),
    getJobLabel("볼분리 보조"),
    getJobLabel("설거지 및 성형보조"),
    getJobLabel("분쇄 및 성형보조"),
    getJobLabel("성형 및 분쇄보조"),
    "총합",
  ].forEach(
    (text) => {
      const th =
        document.createElement(
          "th",
        );

      th.textContent =
        text;

      header.appendChild(
        th,
      );
    },
  );

  thead.appendChild(
    header,
  );

  const tbody =
    document.createElement(
      "tbody",
    );

  for (
    const worker of WORKERS
  ) {
    const row =
      document.createElement(
        "tr",
      );

    const values = [
      getWorkerLabel(worker),

      counts[worker][
        "볼분리"
      ],

      counts[worker][
        "볼분리 보조"
      ],

      counts[worker][
        "설거지 및 성형보조"
      ],

      counts[worker][
        "분쇄 및 성형보조"
      ],

      counts[worker][
        "성형 및 분쇄보조"
      ],
    ];

    const total =
      values
        .slice(1)
        .reduce(
          (sum, value) =>
            sum + value,
          0,
        );

    values.push(
      total,
    );

    values.forEach(
      (value, index) => {
        const td =
          document.createElement(
            "td",
          );

        if (
          index ===
          values.length - 1
        ) {
          const strong =
            document.createElement(
              "strong",
            );

          strong.textContent =
            String(value);

          td.appendChild(
            strong,
          );
        } else {
          td.textContent =
            String(value);
        }

        row.appendChild(
          td,
        );
      },
    );

    tbody.appendChild(
      row,
    );
  }

  table.appendChild(
    thead,
  );

  table.appendChild(
    tbody,
  );

  wrapper.appendChild(
    table,
  );

  container.innerHTML =
    "";

  container.appendChild(
    wrapper,
  );
}


/* =========================================================
 * 데이터 상태
 * ======================================================= */

function updateDataStatus() {
  const element =
    document.getElementById(
      "dataStatus",
    );

  if (!element) {
    return;
  }

  const historyCount =
    Object.keys(
      appData.history,
    ).length;

  let baselineTotal =
    0;

  for (
    const worker of WORKERS
  ) {
    for (
      const job of JOBS
    ) {
      baselineTotal +=
        appData.baseline[
          worker
        ][job];
    }
  }

  if (
    historyCount === 0 &&
    baselineTotal === 0
  ) {
    element.textContent =
      "누적 데이터 없음";

    return;
  }

  element.textContent =
    `상세 기록 ${historyCount}개월 · 압축 누적 ${baselineTotal}건`;
}


/* =========================================================
 * JSON
 * ======================================================= */

function getCurrentDataPayload() {
  return {
    version:
      DATA_VERSION,

    retentionMonths:
      RETENTION_MONTHS,

    baseline:
      deepClone(
        appData.baseline,
      ),

    names:
      deepClone(
        appData.names,
      ),

    history:
      deepClone(
        appData.history,
      ),

    leave:
      deepClone(
        appData.leave,
      ),
  };
}


async function copyJsonToClipboard() {
  const json =
    JSON.stringify(
      getCurrentDataPayload(),
      null,
      2,
    );

  try {
    await navigator.clipboard.writeText(
      json,
    );

    return true;
  } catch (error) {
    const textarea =
      document.createElement(
        "textarea",
      );

    textarea.value =
      json;

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

      textarea.remove();

      return true;
    } catch (
      copyError
    ) {
      console.error(
        copyError,
      );

      textarea.remove();

      return false;
    }
  }
}


async function handleCopyJson() {
  const copied =
    await copyJsonToClipboard();

  const status =
    document.getElementById(
      "githubSaveStatus",
    );

  if (copied) {
    if (status) {
      status.textContent =
        "현재 데이터가 JSON으로 복사되었습니다.";

      status.classList.add(
        "success",
      );
    }

    alert(
      "JSON이 복사되었습니다.",
    );
  } else {
    alert(
      "JSON 복사에 실패했습니다.",
    );
  }
}


async function handlePrepareGithub() {
  try {
    githubConfig =
      readGithubInputs();

    saveGithubConfig();

    const copied =
      await copyJsonToClipboard();

    const url =
      getGithubEditUrl();

    if (!url) {
      throw new Error(
        "GitHub 편집 URL을 만들 수 없습니다.",
      );
    }

    window.open(
      url,
      "_blank",
      "noopener,noreferrer",
    );

    const status =
      document.getElementById(
        "githubSaveStatus",
      );

    if (status) {
      status.textContent =
        copied
          ? "JSON을 복사하고 GitHub 편집 화면을 열었습니다. history.json 전체 내용을 붙여넣은 뒤 Commit changes를 누르세요."
          : "GitHub 편집 화면을 열었습니다. JSON 복사는 실패했습니다.";

      status.classList.add(
        "success",
      );
    }
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "GitHub 저장 준비에 실패했습니다.",
    );
  }
}


/* =========================================================
 * JSON 백업
 * ======================================================= */

function handleExport() {
  const json =
    JSON.stringify(
      getCurrentDataPayload(),
      null,
      2,
    );

  const blob =
    new Blob(
      [json],
      {
        type:
          "application/json",
      },
    );

  const url =
    URL.createObjectURL(
      blob,
    );

  const link =
    document.createElement(
      "a",
    );

  link.href =
    url;

  link.download =
    `assignment-history-${getFileDateString()}.json`;

  document.body.appendChild(
    link,
  );

  link.click();

  link.remove();

  URL.revokeObjectURL(
    url,
  );
}


function getFileDateString() {
  const date =
    new Date();

  return [
    date.getFullYear(),

    String(
      date.getMonth() + 1,
    ).padStart(
      2,
      "0",
    ),

    String(
      date.getDate(),
    ).padStart(
      2,
      "0",
    ),
  ].join("");
}


/* =========================================================
 * JSON 복원
 * ======================================================= */

function handleImport(
  event,
) {
  const file =
    event.target.files?.[0];

  if (!file) {
    return;
  }

  const reader =
    new FileReader();

  reader.onload =
    () => {
      try {
        appData =
          normalizeData(
            JSON.parse(
              reader.result,
            ),
          );

        saveLocalData();

        renderLeaveList();
        renderCalendar();
        updateDataStatus();

        alert(
          "데이터를 복원했습니다.",
        );
      } catch (error) {
        console.error(
          error,
        );

        alert(
          "올바른 JSON 데이터가 아닙니다.",
        );
      } finally {
        event.target.value =
          "";
      }
    };

  reader.onerror =
    () => {
      alert(
        "파일을 읽지 못했습니다.",
      );

      event.target.value =
        "";
    };

  reader.readAsText(
    file,
    "utf-8",
  );
}


/* =========================================================
 * 전체 데이터 삭제
 * ======================================================= */

function handleClearData() {
  const first =
    window.confirm(
      "모든 배정 기록, 누적 데이터, 연차 데이터를 삭제할까요?",
    );

  if (!first) {
    return;
  }

  const second =
    window.confirm(
      "정말 전체 데이터를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.",
    );

  if (!second) {
    return;
  }

  appData =
    createEmptyData();

  currentSchedule = [];

  currentOriginalSchedule = [];

  currentOriginalCounts = null;

  copiedText = "";

  saveLocalData();

  renderNameSettings();

  renderLeaveList();

  renderEmptySummaries();

  renderCalendar();

  const result =
    document.getElementById(
      "resultText",
    );

  if (result) {
    result.textContent =
      "";
  }

  const status =
    document.getElementById(
      "statusText",
    );

  if (status) {
    status.textContent =
      "아직 생성되지 않았습니다.";

    status.classList.remove(
      "success",
    );
  }

  updateDataStatus();
}


function renderEmptySummaries() {
  const summary =
    document.getElementById(
      "summaryContainer",
    );

  if (summary) {
    summary.innerHTML = `
      <div class="empty-state">
        배정표를 생성하면 횟수가 표시됩니다.
      </div>
    `;
  }

  const workers =
    document.getElementById(
      "workerSummaryContainer",
    );

  if (workers) {
    workers.innerHTML = `
      <div class="empty-state">
        배정표를 생성하면 작업자별 횟수가 표시됩니다.
      </div>
    `;
  }
}


/* =========================================================
 * 연차 입력
 * ======================================================= */

function handleSaveLeave() {
  const input =
    document.getElementById(
      "leaveDateInput",
    );

  if (
    !input ||
    !input.value
  ) {
    alert(
      "연차 날짜를 선택해주세요.",
    );

    return;
  }

  const workers =
    [
      ...document.querySelectorAll(
        "[data-leave-worker]:checked",
      ),
    ].map(
      (checkbox) =>
        checkbox.value,
    );

  if (
    workers.length === 0
  ) {
    alert(
      "연차자를 한 명 이상 선택해주세요.",
    );

    return;
  }

  setLeaveWorkers(
    input.value,
    workers,
  );

  input.value =
    "";

  document
    .querySelectorAll(
      "[data-leave-worker]",
    )
    .forEach(
      (checkbox) => {
        checkbox.checked =
          false;
      },
    );
}


function handleClearLeaves() {
  const confirmed =
    window.confirm(
      "등록된 연차를 모두 삭제할까요?",
    );

  if (!confirmed) {
    return;
  }

  appData.leave =
    {};

  saveLocalData();

  renderLeaveList();
  renderCalendar();
}


/* =========================================================
 * GitHub 설정
 * ======================================================= */

function handleSaveGithubConfig() {
  try {
    githubConfig =
      readGithubInputs();

    saveGithubConfig();

    alert(
      "GitHub 설정을 저장했습니다.",
    );
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "GitHub 설정을 확인해주세요.",
    );
  }
}


async function handleTestGithub() {
  try {
    githubConfig =
      readGithubInputs();

    saveGithubConfig();

    await loadRepositoryData(
      true,
    );
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "GitHub 설정을 확인해주세요.",
    );
  }
}


function handleOpenGithubEdit() {
  try {
    githubConfig =
      readGithubInputs();

    saveGithubConfig();

    const url =
      getGithubEditUrl();

    if (!url) {
      throw new Error(
        "GitHub 편집 URL을 만들 수 없습니다.",
      );
    }

    window.open(
      url,
      "_blank",
      "noopener,noreferrer",
    );
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "GitHub 편집 화면을 열 수 없습니다.",
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
    } catch (
      copyError
    ) {
      console.error(
        copyError,
      );

      alert(
        "복사에 실패했습니다.",
      );
    }

    textarea.remove();
  }
}


/* =========================================================
 * 이름/업무명 설정
 * ======================================================= */

function renderNameSettings() {
  const workerContainer = document.getElementById("workerNameSettings");
  const jobContainer = document.getElementById("jobNameSettings");

  if (workerContainer) {
    workerContainer.innerHTML = "";

    for (const worker of WORKERS) {
      const label = document.createElement("label");
      label.className = "name-setting-item";

      const title = document.createElement("span");
      title.textContent = `작업자 ${WORKERS.indexOf(worker) + 1}`;

      const input = document.createElement("input");
      input.type = "text";
      input.className = "worker-name-input";
      input.dataset.worker = worker;
      input.maxLength = 30;
      input.value = getWorkerLabel(worker);

      label.appendChild(title);
      label.appendChild(input);
      workerContainer.appendChild(label);
    }
  }

  if (jobContainer) {
    jobContainer.innerHTML = "";

    for (const job of JOBS) {
      const label = document.createElement("label");
      label.className = "name-setting-item";

      const title = document.createElement("span");
      title.textContent = `업무 ${JOBS.indexOf(job) + 1}`;

      const input = document.createElement("input");
      input.type = "text";
      input.className = "job-name-input";
      input.dataset.job = job;
      input.maxLength = 50;
      input.value = getJobLabel(job);

      label.appendChild(title);
      label.appendChild(input);
      jobContainer.appendChild(label);
    }
  }
}

function updateLeaveWorkerLabels() {
  document.querySelectorAll("[data-worker-label]").forEach((element) => {
    const worker = element.dataset.workerLabel;
    element.textContent = getWorkerLabel(worker);
  });
}

function handleSaveNameSettings() {
  const workerInputs = [
    ...document.querySelectorAll(".worker-name-input"),
  ];
  const jobInputs = [
    ...document.querySelectorAll(".job-name-input"),
  ];

  const workers = {};
  const jobs = {};

  for (const input of workerInputs) {
    const value = input.value.trim();
    if (!value) {
      alert("작업자 이름은 비워둘 수 없습니다.");
      input.focus();
      return;
    }
    workers[input.dataset.worker] = value;
  }

  for (const input of jobInputs) {
    const value = input.value.trim();
    if (!value) {
      alert("업무명은 비워둘 수 없습니다.");
      input.focus();
      return;
    }
    jobs[input.dataset.job] = value;
  }

  const workerValues = Object.values(workers);
  const jobValues = Object.values(jobs);

  if (new Set(workerValues).size !== workerValues.length) {
    alert("작업자 이름은 서로 다르게 입력해주세요.");
    return;
  }

  if (new Set(jobValues).size !== jobValues.length) {
    alert("업무명은 서로 다르게 입력해주세요.");
    return;
  }

  appData.names = { workers, jobs };
  saveLocalData();
  renderNameSettings();
  updateLeaveWorkerLabels();
  renderSchedule();
  renderLeaveList();
  renderCalendar();

  const status = document.getElementById("nameSettingsStatus");
  if (status) {
    status.textContent =
      "이름 및 업무명을 저장했습니다. GitHub에도 반영하려면 GitHub 저장 준비를 실행하세요.";
    status.classList.add("success");
  }
}

function handleResetNameSettings() {
  const confirmed = window.confirm(
    "작업자 이름과 업무명을 기본값으로 되돌릴까요?"
  );

  if (!confirmed) {
    return;
  }

  appData.names = createDefaultNameSettings();
  saveLocalData();
  renderNameSettings();
  updateLeaveWorkerLabels();
  renderSchedule();
  renderLeaveList();
  renderCalendar();

  const status = document.getElementById("nameSettingsStatus");
  if (status) {
    status.textContent = "기본 이름과 업무명으로 되돌렸습니다.";
    status.classList.add("success");
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

  const dark =
    document.body.classList.contains(
      "dark",
    );

  button.textContent =
    dark
      ? "라이트모드"
      : "다크모드";
}


function restoreTheme() {
  const theme =
    localStorage.getItem(
      THEME_KEY,
    );

  if (
    theme === "dark"
  ) {
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

  const dark =
    document.body.classList.contains(
      "dark",
    );

  localStorage.setItem(
    THEME_KEY,
    dark
      ? "dark"
      : "light",
  );

  updateThemeButton();
}


/* =========================================================
 * 유틸리티
 * ======================================================= */

function getWeekdayName(
  weekday,
) {
  const names = [
    "일",
    "월",
    "화",
    "수",
    "목",
    "금",
    "토",
  ];

  return names[
    weekday
  ];
}


function escapeHtml(
  value,
) {
  return String(
    value ?? "",
  )
    .replaceAll(
      "&",
      "&amp;",
    )
    .replaceAll(
      "<",
      "&lt;",
    )
    .replaceAll(
      ">",
      "&gt;",
    )
    .replaceAll(
      '"',
      "&quot;",
    )
    .replaceAll(
      "'",
      "&#039;",
    );
}


/* =========================================================
 * 초기화
 * ======================================================= */

async function initializeApp() {
  restoreTheme();

  loadGithubConfig();

  loadLocalData();

  updateGithubForm();

  updateGithubConfigStatus();

  renderLeaveList();

  renderEmptySummaries();

  updateDataStatus();

  updateCalendarToGeneratedMonth();

  renderCalendar();


  if (
    githubConfig.owner &&
    githubConfig.repo
  ) {
    await loadRepositoryData(
      false,
    );
  }


  document
    .getElementById(
      "saveNameSettingsButton",
    )
    ?.addEventListener(
      "click",
      handleSaveNameSettings,
    );

  document
    .getElementById(
      "resetNameSettingsButton",
    )
    ?.addEventListener(
      "click",
      handleResetNameSettings,
    );


  document
    .getElementById(
      "generateButton",
    )
    ?.addEventListener(
      "click",
      handleGenerate,
    );


  document
    .getElementById(
      "copyButton",
    )
    ?.addEventListener(
      "click",
      handleCopy,
    );


  document
    .getElementById(
      "themeToggle",
    )
    ?.addEventListener(
      "click",
      handleThemeToggle,
    );


  document
    .getElementById(
      "previousMonthButton",
    )
    ?.addEventListener(
      "click",
      () =>
        moveCalendarMonth(
          -1,
        ),
    );


  document
    .getElementById(
      "nextMonthButton",
    )
    ?.addEventListener(
      "click",
      () =>
        moveCalendarMonth(
          1,
        ),
    );


  document
    .getElementById(
      "saveLeaveButton",
    )
    ?.addEventListener(
      "click",
      handleSaveLeave,
    );


  document
    .getElementById(
      "clearLeaveButton",
    )
    ?.addEventListener(
      "click",
      handleClearLeaves,
    );


  document
    .getElementById(
      "saveGithubConfigButton",
    )
    ?.addEventListener(
      "click",
      handleSaveGithubConfig,
    );


  document
    .getElementById(
      "testGithubButton",
    )
    ?.addEventListener(
      "click",
      handleTestGithub,
    );


  document
    .getElementById(
      "prepareGithubButton",
    )
    ?.addEventListener(
      "click",
      handlePrepareGithub,
    );


  document
    .getElementById(
      "copyJsonButton",
    )
    ?.addEventListener(
      "click",
      handleCopyJson,
    );


  document
    .getElementById(
      "openGithubEditButton",
    )
    ?.addEventListener(
      "click",
      handleOpenGithubEdit,
    );


  document
    .getElementById(
      "loadRepositoryButton",
    )
    ?.addEventListener(
      "click",
      () =>
        loadRepositoryData(
          true,
        ),
    );


  document
    .getElementById(
      "exportButton",
    )
    ?.addEventListener(
      "click",
      handleExport,
    );


  document
    .getElementById(
      "importInput",
    )
    ?.addEventListener(
      "change",
      handleImport,
    );


  document
    .getElementById(
      "clearDataButton",
    )
    ?.addEventListener(
      "click",
      handleClearData,
    );


  document
    .getElementById(
      "leaveDateInput",
    )
    ?.addEventListener(
      "change",
      (event) => {
        loadLeaveCheckboxes(
          event.target.value,
        );
      },
    );


  document
    .querySelectorAll(
      "[data-leave-worker]",
    )
    .forEach(
      (checkbox) => {
        checkbox.addEventListener(
          "change",
          () => {
            /*
             * 체크 변경 자체는 저장하지 않는다.
             * 저장 버튼을 눌렀을 때 반영.
             */
          },
        );
      },
    );


  document
    .getElementById(
      "yearInput",
    )
    ?.addEventListener(
      "change",
      () => {
        updateCalendarToGeneratedMonth();
        renderCalendar();
      },
    );


  document
    .getElementById(
      "monthInput",
    )
    ?.addEventListener(
      "change",
      () => {
        updateCalendarToGeneratedMonth();
        renderCalendar();
      },
    );


  document
    .getElementById(
      "closeDayDetailButton",
    )
    ?.addEventListener(
      "click",
      closeDayDetail,
    );


  document
    .getElementById(
      "dayDetailCloseButton",
    )
    ?.addEventListener(
      "click",
      closeDayDetail,
    );


  document
    .getElementById(
      "dayDetailLeaveButton",
    )
    ?.addEventListener(
      "click",
      handleDayDetailLeave,
    );


  document
    .getElementById(
      "dayDetailModal",
    )
    ?.addEventListener(
      "click",
      (event) => {
        if (
          event.target.id ===
          "dayDetailModal"
        ) {
          closeDayDetail();
        }
      },
    );


  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape"
      ) {
        closeDayDetail();
      }
    },
  );
}


document.addEventListener(
  "DOMContentLoaded",
  initializeApp,
);