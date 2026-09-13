"use strict";

/*
 * =========================================================
 * 업무 배정표 자동 생성기
 * =========================================================
 *
 * 저장 구조
 *
 * GitHub
 *   data/history.json
 *
 * 브라우저
 *   localStorage
 *
 * GitHub Pages
 *   history.json 읽기 가능
 *
 * 주의
 * ---------------------------------------------------------
 * 브라우저에 GitHub 토큰을 저장하지 않는다.
 * 따라서 저장은
 *
 * 1. JSON 자동 복사
 * 2. GitHub 편집 화면 열기
 * 3. 사용자가 Commit
 *
 * 방식으로 처리한다.
 * =========================================================
 */

const STORAGE_KEY =
  "assignment-app-data-v4";

const GITHUB_CONFIG_KEY =
  "assignment-app-github-config-v1";

const THEME_KEY =
  "assignment-app-theme";

const DATA_VERSION = 4;

const RETENTION_MONTHS = 6;

const BEAM_WIDTH = 3000;

const MAX_STATES_PER_SIGNATURE = 2;


/* =========================================================
 * 작업자
 * ========================================================= */

const WORKERS = [
  "김",
  "탁",
  "임",
  "박",
  "류",
];


/* =========================================================
 * 업무
 * ========================================================= */

const JOBS = [
  "볼분리",
  "볼분리 보조",
  "설거지 및 성형보조",
  "분쇄 및 성형보조",
  "성형 및 분쇄보조",
];


/* =========================================================
 * 작업 제한
 * ========================================================= */

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
 * 전역 상태
 * ========================================================= */

let appData =
  createEmptyData();

let githubConfig =
  createEmptyGithubConfig();

let currentSchedule = [];

let currentOriginalSchedule = [];

let currentOriginalCounts = null;

let copiedText = "";


/* =========================================================
 * 빈 데이터
 * ========================================================= */

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


/* =========================================================
 * 복제
 * ========================================================= */

function deepClone(value) {
  return JSON.parse(
    JSON.stringify(value),
  );
}


/* =========================================================
 * 데이터 정규화
 * ========================================================= */

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
  const result =
    createEmptyData();

  if (
    !input ||
    typeof input !==
      "object"
  ) {
    return result;
  }

  result.baseline =
    normalizeWorkerCounts(
      input.baseline,
    );

  result.history =
    normalizeHistory(
      input.history,
    );

  result.leave =
    normalizeLeaveMap(
      input.leave,
    );

  return result;
}


/* =========================================================
 * GitHub 설정 저장/불러오기
 * ========================================================= */

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

    const parsed =
      JSON.parse(raw);

    githubConfig = {
      ...createEmptyGithubConfig(),

      ...parsed,
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
  try {
    localStorage.setItem(
      GITHUB_CONFIG_KEY,
      JSON.stringify(
        githubConfig,
      ),
    );

    updateGithubForm();

    updateGithubConfigStatus();
  } catch (error) {
    console.error(
      "GitHub 설정 저장 실패:",
      error,
    );

    alert(
      "GitHub 설정을 브라우저에 저장하지 못했습니다.",
    );
  }
}


/* =========================================================
 * GitHub 설정 읽기
 * ========================================================= */

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

  if (!branch) {
    throw new Error(
      "브랜치를 입력해주세요.",
    );
  }

  if (!dataPath) {
    throw new Error(
      "데이터 경로를 입력해주세요.",
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


/* =========================================================
 * GitHub 설정 화면
 * ========================================================= */

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
 * localStorage 데이터
 * ========================================================= */

function loadLocalData() {
  try {
    const raw =
      localStorage.getItem(
        STORAGE_KEY,
      );

    if (!raw) {
      return false;
    }

    const parsed =
      JSON.parse(raw);

    appData =
      normalizeData(
        parsed,
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
 * GitHub 데이터 URL
 * ========================================================= */

function getGithubRawUrl() {
  if (
    !githubConfig.owner ||
    !githubConfig.repo
  ) {
    return null;
  }


  const encodedPath =
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
    `https://raw.githubusercontent.com/` +
    `${encodeURIComponent(
      githubConfig.owner,
    )}/` +
    `${encodeURIComponent(
      githubConfig.repo,
    )}/` +
    `${encodeURIComponent(
      githubConfig.branch,
    )}/` +
    `${encodedPath}`
  );
}


function getGithubEditUrl() {
  if (
    !githubConfig.owner ||
    !githubConfig.repo
  ) {
    return null;
  }


  const encodedPath =
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
    `https://github.com/` +
    `${encodeURIComponent(
      githubConfig.owner,
    )}/` +
    `${encodeURIComponent(
      githubConfig.repo,
    )}/edit/` +
    `${encodeURIComponent(
      githubConfig.branch,
    )}/` +
    encodedPath
  );
}


/* =========================================================
 * GitHub 기록 불러오기
 * ========================================================= */

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
      appData =
        createEmptyData();

      saveLocalData();

      renderLeaveList();

      updateDataStatus();

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


    const json =
      await response.json();


    appData =
      normalizeData(
        json,
      );


    saveLocalData();

    renderLeaveList();

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
 * GitHub 저장소 확인
 * ========================================================= */

async function handleTestGithub() {
  try {
    githubConfig =
      readGithubInputs();

    saveGithubConfig();

    const loaded =
      await loadRepositoryData(
        false,
      );

    if (loaded) {
      alert(
        "GitHub 저장소와 history.json을 확인했습니다.",
      );
    } else {
      alert(
        "저장소 정보는 정상적으로 설정되었지만 history.json을 확인하지 못했습니다.\n\n파일이 아직 없다면 data/history.json을 먼저 만들어주세요.",
      );
    }
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "GitHub 설정을 확인해주세요.",
    );
  }
}


/* =========================================================
 * 월 계산
 * ========================================================= */

function getMonthKey(
  year,
  month,
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
  ].join("-");
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
      Number(
        match[1],
      ),

    month:
      Number(
        match[2],
      ),
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
  const keys = [];

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

    keys.push(
      getMonthKey(
        date.year,
        date.month,
      ),
    );
  }

  return keys;
}


/* =========================================================
 * 날짜
 * ========================================================= */

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


/* =========================================================
 * 누적 데이터
 * ========================================================= */

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


function getStartingCounts(
  year,
  month,
) {
  let counts =
    normalizeWorkerCounts(
      appData.baseline,
    );


  const targetKey =
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
      key === targetKey
    ) {
      continue;
    }


    const monthData =
      appData.history[
        key
      ];


    if (
      !monthData ||
      !monthData.originalCounts
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
 * 오래된 기록 정리
 * ========================================================= */

function cleanupOldHistory(
  referenceYear = null,
  referenceMonth = null,
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


  let latestKey;


  if (
    referenceYear &&
    referenceMonth
  ) {
    latestKey =
      getMonthKey(
        referenceYear,
        referenceMonth,
      );
  } else {
    latestKey =
      keys[keys.length - 1];
  }


  const latest =
    parseMonthKey(
      latestKey,
    );


  if (!latest) {
    return;
  }


  const keep =
    new Set(
      getRollingMonthKeys(
        latest.year,
        latest.month,
      ),
    );


  const oldKeys =
    keys.filter(
      (key) =>
        !keep.has(key),
    );


  if (
    oldKeys.length === 0
  ) {
    return;
  }


  for (
    const key of oldKeys
  ) {
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
 * 업무 가능 여부
 * ========================================================= */

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
 * ========================================================= */

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
 * ========================================================= */

function generateDailyCandidates() {
  const result = [];


  const permutations =
    generatePermutations(
      WORKERS,
    );


  for (
    const permutation of
      permutations
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
        permutation[i];


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


    const usedWorkers =
      JOBS.map(
        (job) =>
          candidate[job],
      );


    if (
      new Set(
        usedWorkers,
      ).size !==
      WORKERS.length
    ) {
      continue;
    }


    result.push(
      candidate,
    );
  }


  return result;
}


/* =========================================================
 * 범위
 * ========================================================= */

function getRange(
  values,
) {
  if (
    !values ||
    values.length === 0
  ) {
    return 0;
  }


  return (
    Math.max(...values) -
    Math.min(...values)
  );
}


/* =========================================================
 * 균형 값
 * ========================================================= */

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


/* =========================================================
 * 연속 업무
 * ========================================================= */

function getJobForWorker(
  day,
  worker,
) {
  for (
    const job of JOBS
  ) {
    if (
      day[job] === worker
    ) {
      return job;
    }
  }


  return null;
}


function calculateConsecutivePenalty(
  schedule,
) {
  if (
    schedule.length < 2
  ) {
    return 0;
  }


  const previous =
    schedule[
      schedule.length - 2
    ];

  const current =
    schedule[
      schedule.length - 1
    ];


  let penalty = 0;


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


  return penalty;
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


/* =========================================================
 * 부분 점수
 * ========================================================= */

function calculatePartialScore(
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


  const liuRange =
    getRange(
      getLiuCounts(
        counts,
      ),
    );


  const parkRange =
    getRange(
      getParkCounts(
        counts,
      ),
    );


  const mainExtraRange =
    getRange(
      getMainExtraCounts(
        counts,
      ),
    );


  const consecutive =
    calculateConsecutivePenalty(
      state.schedule,
    );


  return (
    bowlRange * 1000000 +
    helperRange * 100000 +
    liuRange * 10000 +
    mainExtraRange * 1000 +
    parkRange * 500 +
    consecutive * 10
  );
}


/* =========================================================
 * 최종 점수
 * ========================================================= */

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
    const values =
      MAIN_WORKERS.map(
        (worker) =>
          counts[worker][job],
      );


    mainJobSpread +=
      getRange(values);
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
 * 상태 서명
 * ========================================================= */

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
 * ========================================================= */

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
 * 상태 추가
 * ======================================================= */

function addCandidateToState(
  state,
  candidate,
  dateInfo,
) {
  const counts =
    addAssignmentToCounts(
      state.counts,
      candidate,
    );


  return {
    schedule: [
      ...state.schedule,

      {
        ...dateInfo,
        ...candidate,
      },
    ],

    counts,

    lastAssignment:
      candidate,
  };
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
    const dateInfo =
      dates[index];


    const nextStates = [];


    for (
      const state of states
    ) {
      for (
        const candidate of
          dailyCandidates
      ) {
        nextStates.push(
          addCandidateToState(
            state,
            candidate,
            dateInfo,
          ),
        );
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
 * 원래 배정 횟수
 * ========================================================= */

function calculateOriginalCounts(
  schedule,
) {
  const counts =
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


      counts[worker][job] +=
        1;
    }
  }


  return counts;
}


/* =========================================================
 * 연차
 * ========================================================= */

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
 * 연차를 실제 화면 배정에 반영
 *
 * 원래 배정은 누적 횟수에 반영.
 * 실제 화면에서는 연차자를 제외하고
 * 비는 업무를 대체자에게 맡긴다.
 * ========================================================= */

function applyLeavesToSchedule(
  originalSchedule,
) {
  const result = [];


  for (
    const originalDay
      of originalSchedule
  ) {
    const dateKey =
      formatDateKey(
        originalDay.year,
        originalDay.month,
        originalDay.day,
      );


    const leaveWorkers =
      getLeaveWorkers(
        dateKey,
      );


    if (
      leaveWorkers.length === 0
    ) {
      result.push({
        ...originalDay,

        leaveWorkers: [],

        replacements: {},
      });

      continue;
    }


    const day = {
      ...originalDay,

      leaveWorkers:
        leaveWorkers.slice(),

      replacements: {},
    };


    const vacantJobs = [];


    for (
      const job of JOBS
    ) {
      const worker =
        originalDay[job];


      if (
        leaveWorkers.includes(
          worker,
        )
      ) {
        delete day[job];


        vacantJobs.push({
          job,

          originalWorker:
            worker,
        });
      }
    }


    const availableWorkers =
      WORKERS.filter(
        (worker) =>
          !leaveWorkers.includes(
            worker,
          ),
      );


    /*
     * 대체 업무 우선순위
     *
     * 1. 해당 업무가 가능한 사람
     * 2. 당일 아직 업무가 없는 사람
     * 3. 누적 횟수가 적은 사람
     */
    for (
      const vacant of vacantJobs
    ) {
      const replacement =
        chooseReplacementWorker(
          availableWorkers,
          vacant.job,
          day,
        );


      if (!replacement) {
        day.replacements[
          vacant.job
        ] = null;

        continue;
      }


      day[vacant.job] =
        replacement;


      day.replacements[
        vacant.job
      ] = {
        originalWorker:
          vacant.originalWorker,

        replacementWorker:
          replacement,
      };
    }


    result.push(
      day,
    );
  }


  return result;
}


function chooseReplacementWorker(
  availableWorkers,
  job,
  day,
) {
  const eligible =
    availableWorkers.filter(
      (worker) =>
        isAllowed(
          worker,
          job,
        ),
    );


  if (
    eligible.length === 0
  ) {
    return null;
  }


  const freeWorkers =
    eligible.filter(
      (worker) =>
        !isWorkerAssignedOnDay(
          day,
          worker,
        ),
    );


  const pool =
    freeWorkers.length >
    0
      ? freeWorkers
      : eligible;


  const startingCounts =
    getStartingCounts(
      Number(
        document.getElementById(
          "yearInput",
        ).value,
      ),
      Number(
        document.getElementById(
          "monthInput",
        ).value,
      ),
    );


  let bestWorker = null;

  let bestScore =
    Infinity;


  for (
    const worker of pool
  ) {
    const count =
      startingCounts[worker][job] +
      getCurrentOriginalJobCount(
        worker,
        job,
      );


    const alreadyAssigned =
      isWorkerAssignedOnDay(
        day,
        worker,
      );


    const score =
      count * 100 +
      (
        alreadyAssigned
          ? 50
          : 0
      );


    if (
      score <
      bestScore
    ) {
      bestScore =
        score;

      bestWorker =
        worker;
    }
  }


  return bestWorker;
}


function getCurrentOriginalJobCount(
  worker,
  job,
) {
  if (
    !currentOriginalCounts
  ) {
    return 0;
  }


  return (
    currentOriginalCounts[
      worker
    ]?.[job] ?? 0
  );
}


function isWorkerAssignedOnDay(
  day,
  worker,
) {
  for (
    const job of JOBS
  ) {
    if (
      day[job] === worker
    ) {
      return true;
    }
  }


  return false;
}


/* =========================================================
 * 검증
 * ========================================================= */

function validateOriginalSchedule(
  schedule,
) {
  const errors = [];


  for (
    const day of schedule
  ) {
    const workers =
      JOBS.map(
        (job) =>
          day[job],
      );


    if (
      workers.some(
        (worker) =>
          !worker,
      )
    ) {
      errors.push(
        `${day.month}월 ${day.day}일: 미배정 업무가 있습니다.`,
      );

      continue;
    }


    if (
      new Set(
        workers,
      ).size !==
      WORKERS.length
    ) {
      errors.push(
        `${day.month}월 ${day.day}일: 작업자가 중복되었습니다.`,
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
          `${day.month}월 ${day.day}일: ${day[job]} → ${job} 규칙 위반`,
        );
      }
    }
  }


  return errors;
}


/* =========================================================
 * 텍스트
 * ========================================================= */

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
    lines.push(
      `### ${day.month}월 ${day.day}일`,
    );


    const leaveWorkers =
      day.leaveWorkers ||
      [];


    const originalDay =
      currentOriginalSchedule.find(
        (item) =>
          item.year ===
            day.year &&
          item.month ===
            day.month &&
          item.day ===
            day.day,
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
          originalDay
            ? getJobForWorker(
                originalDay,
                worker,
              )
            : null;


        lines.push(
          `${worker} → 연차${
            originalJob
              ? ` (원래 ${originalJob})`
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


      if (!job) {
        lines.push(
          `${worker} → 미배정`,
        );

        continue;
      }


      const replacement =
        Object.values(
          day.replacements ||
            {},
        ).find(
          (item) =>
            item &&
            item.replacementWorker ===
              worker,
        );


      if (
        replacement
      ) {
        lines.push(
          `${worker} → ${job} (연차 대체)`,
        );
      } else {
        lines.push(
          `${worker} → ${job}`,
        );
      }
    }


    const replacementEntries =
      Object.entries(
        day.replacements ||
          {},
      );


    if (
      replacementEntries.length >
      0
    ) {
      lines.push("");

      lines.push(
        "[연차 대체]",
      );


      for (
        const [
          job,
          replacement,
        ] of replacementEntries
      ) {
        if (!replacement) {
          lines.push(
            `${job}: 대체자 없음`,
          );

          continue;
        }


        lines.push(
          `${job}: ${replacement.originalWorker} 연차 → ${replacement.replacementWorker}`,
        );
      }
    }


    lines.push("");
  }


  return lines.join("\n");
}


/* =========================================================
 * 업무별 요약
 * ========================================================= */

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
        counts[job] +=
          1;
      }
    }
  }


  container.innerHTML = "";


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
      job;


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
 * 빈 업무 카운트
 * ========================================================= */

function createEmptyJobCounts() {
  const result = {};

  for (
    const job of JOBS
  ) {
    result[job] = 0;
  }

  return result;
}


/* =========================================================
 * 작업자별 요약
 * ========================================================= */

function renderWorkerSummary() {
  const container =
    document.getElementById(
      "workerSummaryContainer",
    );


  if (!container) {
    return;
  }


  const counts =
    calculateOriginalCounts(
      currentOriginalSchedule,
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


  for (
    const header of headers
  ) {
    const th =
      document.createElement(
        "th",
      );


    th.textContent =
      header;


    headerRow.appendChild(
      th,
    );
  }


  thead.appendChild(
    headerRow,
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


    let total = 0;


    const values = [
      worker,

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


    for (
      let i = 1;
      i < values.length;
      i += 1
    ) {
      total +=
        values[i];
    }


    values.push(
      total,
    );


    for (
      let i = 0;
      i < values.length;
      i += 1
    ) {
      const td =
        document.createElement(
          "td",
        );


      if (
        i ===
        values.length - 1
      ) {
        const strong =
          document.createElement(
            "strong",
          );


        strong.textContent =
          String(
            values[i],
          );


        td.appendChild(
          strong,
        );
      } else {
        td.textContent =
          String(
            values[i],
          );
      }


      row.appendChild(
        td,
      );
    }


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
 * 연차 목록
 * ========================================================= */

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


    const workerText =
      document.createElement(
        "div",
      );


    workerText.className =
      "leave-workers";


    workerText.textContent =
      workers.join(
        " · ",
      );


    main.appendChild(
      date,
    );


    main.appendChild(
      workerText,
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


  return `${date.getFullYear()}년 ${
    date.getMonth() + 1
  }월 ${date.getDate()}일 (${
    getWeekdayName(
      date.getDay(),
    )
  })`;
}


/* =========================================================
 * 데이터 상태
 * ========================================================= */

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


  let baselineTotal = 0;


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
 * 현재 월 저장 데이터 만들기
 * ========================================================= */

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


/* =========================================================
 * JSON 복사
 * ========================================================= */

async function copyJsonToClipboard() {
  const payload =
    getCurrentDataPayload();


  const json =
    JSON.stringify(
      payload,
      null,
      2,
    );


  try {
    await navigator.clipboard.writeText(
      json,
    );


    return true;
  } catch (error) {
    console.error(
      "JSON 복사 실패:",
      error,
    );


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
        "현재 history.json 내용이 클립보드에 복사되었습니다.";

      status.classList.add(
        "success",
      );
    }


    alert(
      "JSON이 복사되었습니다.",
    );
  } else {
    if (status) {
      status.textContent =
        "JSON 복사에 실패했습니다.";

      status.classList.remove(
        "success",
      );
    }


    alert(
      "JSON 복사에 실패했습니다.",
    );
  }
}


/* =========================================================
 * GitHub 저장 준비
 * ========================================================= */

async function handlePrepareGithub() {
  try {
    githubConfig =
      readGithubInputs();

    saveGithubConfig();


    const copied =
      await copyJsonToClipboard();


    const editUrl =
      getGithubEditUrl();


    if (!editUrl) {
      throw new Error(
        "GitHub 편집 URL을 만들 수 없습니다.",
      );
    }


    window.open(
      editUrl,
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
          ? "JSON을 클립보드에 복사했고 GitHub 편집 화면을 열었습니다.\nGitHub의 history.json 전체 내용을 붙여넣은 뒤 Commit changes를 누르세요."
          : "GitHub 편집 화면을 열었습니다.\nJSON 복사는 실패했으므로 앱의 'JSON 복사' 버튼으로 다시 복사해주세요.";

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
 * GitHub 편집 화면
 * ========================================================= */

function handleOpenGithubEdit() {
  try {
    githubConfig =
      readGithubInputs();

    saveGithubConfig();


    const editUrl =
      getGithubEditUrl();


    if (!editUrl) {
      throw new Error(
        "GitHub 편집 URL을 만들 수 없습니다.",
      );
    }


    window.open(
      editUrl,
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
 * JSON 파일 백업
 * ========================================================= */

function handleExport() {
  const payload =
    getCurrentDataPayload();


  const json =
    JSON.stringify(
      payload,
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
 * ========================================================= */

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
        const parsed =
          JSON.parse(
            reader.result,
          );


        appData =
          normalizeData(
            parsed,
          );


        saveLocalData();


        renderLeaveList();

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
 * ========================================================= */

function handleClearData() {
  const confirmed =
    window.confirm(
      "모든 배정 기록, 누적 데이터, 연차 데이터를 삭제할까요?",
    );


  if (!confirmed) {
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


  renderLeaveList();

  renderEmptySummaries();


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


/* =========================================================
 * 빈 요약
 * ========================================================= */

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
 * 자동 배정
 * ========================================================= */

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


        cleanupOldHistory(
          year,
          month,
        );


        const startingCounts =
          getStartingCounts(
            year,
            month,
          );


        const originalSchedule =
          optimizeMonth(
            year,
            month,
            startDay,
            endDay,
            startingCounts,
          );


        currentOriginalSchedule =
          originalSchedule;


        currentOriginalCounts =
          calculateOriginalCounts(
            originalSchedule,
          );


        /*
         * 연차를 반영한 실제 화면
         */
        currentSchedule =
          applyLeavesToSchedule(
            originalSchedule,
          );


        /*
         * 상세 기록은 원래 정상 배정을 저장
         */
        const key =
          getMonthKey(
            year,
            month,
          );


        appData.history[key] =
          {
            schedule:
              deepClone(
                originalSchedule,
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
 * 날짜 입력
 * ========================================================= */

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
      "시작일이 올바르지 않습니다.",
    );
  }


  if (
    endDay < 1 ||
    endDay > daysInMonth
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
 * 다크모드
 * ========================================================= */

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


  const isDark =
    document.body.classList.contains(
      "dark",
    );


  localStorage.setItem(
    THEME_KEY,
    isDark
      ? "dark"
      : "light",
  );


  updateThemeButton();
}


/* =========================================================
 * 요일
 * ========================================================= */

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


/* =========================================================
 * 초기화
 * ========================================================= */

async function initializeApp() {
  restoreTheme();


  loadGithubConfig();

  loadLocalData();


  updateGithubForm();

  updateGithubConfigStatus();

  renderLeaveList();

  renderEmptySummaries();

  updateDataStatus();


  /*
   * GitHub 기록을 자동으로 우선 확인한다.
   */
  if (
    githubConfig.owner &&
    githubConfig.repo
  ) {
    await loadRepositoryData(
      false,
    );
  }


  const generateButton =
    document.getElementById(
      "generateButton",
    );


  if (
    generateButton
  ) {
    generateButton.addEventListener(
      "click",
      handleGenerate,
    );
  }


  const copyButton =
    document.getElementById(
      "copyButton",
    );


  if (
    copyButton
  ) {
    copyButton.addEventListener(
      "click",
      handleCopy,
    );
  }


  const themeButton =
    document.getElementById(
      "themeToggle",
    );


  if (
    themeButton
  ) {
    themeButton.addEventListener(
      "click",
      handleThemeToggle,
    );
  }


  const saveLeaveButton =
    document.getElementById(
      "saveLeaveButton",
    );


  if (
    saveLeaveButton
  ) {
    saveLeaveButton.addEventListener(
      "click",
      handleSaveLeave,
    );
  }


  const clearLeaveButton =
    document.getElementById(
      "clearLeaveButton",
    );


  if (
    clearLeaveButton
  ) {
    clearLeaveButton.addEventListener(
      "click",
      handleClearLeaves,
    );
  }


  const saveGithubConfigButton =
    document.getElementById(
      "saveGithubConfigButton",
    );


  if (
    saveGithubConfigButton
  ) {
    saveGithubConfigButton.addEventListener(
      "click",
      handleSaveGithubConfig,
    );
  }


  const testGithubButton =
    document.getElementById(
      "testGithubButton",
    );


  if (
    testGithubButton
  ) {
    testGithubButton.addEventListener(
      "click",
      handleTestGithub,
    );
  }


  const prepareGithubButton =
    document.getElementById(
      "prepareGithubButton",
    );


  if (
    prepareGithubButton
  ) {
    prepareGithubButton.addEventListener(
      "click",
      handlePrepareGithub,
    );
  }


  const copyJsonButton =
    document.getElementById(
      "copyJsonButton",
    );


  if (
    copyJsonButton
  ) {
    copyJsonButton.addEventListener(
      "click",
      handleCopyJson,
    );
  }


  const openGithubEditButton =
    document.getElementById(
      "openGithubEditButton",
    );


  if (
    openGithubEditButton
  ) {
    openGithubEditButton.addEventListener(
      "click",
      handleOpenGithubEdit,
    );
  }


  const loadRepositoryButton =
    document.getElementById(
      "loadRepositoryButton",
    );


  if (
    loadRepositoryButton
  ) {
    loadRepositoryButton.addEventListener(
      "click",
      () =>
        loadRepositoryData(
          true,
        ),
    );
  }


  const exportButton =
    document.getElementById(
      "exportButton",
    );


  if (
    exportButton
  ) {
    exportButton.addEventListener(
      "click",
      handleExport,
    );
  }


  const importInput =
    document.getElementById(
      "importInput",
    );


  if (
    importInput
  ) {
    importInput.addEventListener(
      "change",
      handleImport,
    );
  }


  const clearDataButton =
    document.getElementById(
      "clearDataButton",
    );


  if (
    clearDataButton
  ) {
    clearDataButton.addEventListener(
      "click",
      handleClearData,
    );
  }
}


/* =========================================================
 * 이벤트 함수
 * ========================================================= */

function handleSaveGithubConfig() {
  try {
    githubConfig =
      readGithubInputs();

    saveGithubConfig();

    alert(
      "GitHub 저장 설정을 저장했습니다.",
    );
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "GitHub 설정을 확인해주세요.",
    );
  }
}


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
      (element) =>
        element.value,
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
}


/* =========================================================
 * 초기 데이터
 * ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  initializeApp,
);
