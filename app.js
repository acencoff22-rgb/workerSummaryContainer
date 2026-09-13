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
 *          ↓
 *      웹앱 불러오기
 *
 * 브라우저
 *   localStorage
 *          ↓
 *      임시 저장
 *
 * 사용자가 백업한 JSON
 *          ↓
 *   GitHub에 커밋 가능
 *
 * =========================================================
 */


const STORAGE_KEY =
  "assignment-app-data-v3";

const THEME_KEY =
  "assignment-app-theme";

const REPOSITORY_DATA_PATH =
  "data/history.json";

const DATA_VERSION = 3;

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
 * 제한
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
 * 전역 상태
 * ======================================================= */

let appData =
  createEmptyData();


let currentSchedule =
  [];


let currentOriginalSchedule =
  [];


let currentOriginalCounts =
  null;


let copiedText =
  "";


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

    history: {},

    leave: {},
  };
}


/* =========================================================
 * 객체 복제
 * ======================================================= */

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
        Number.isFinite(value) &&
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

  result.version =
    DATA_VERSION;

  result.retentionMonths =
    RETENTION_MONTHS;

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
 * localStorage
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
 * GitHub Pages의 history.json 불러오기
 * ======================================================= */

async function loadRepositoryData(
  showAlert = true,
) {
  const status =
    document.getElementById(
      "dataStatus",
    );

  if (status) {
    status.textContent =
      "GitHub 기록 불러오는 중...";
  }

  try {
    /*
     * document.baseURI를 사용해야
     * 사용자 저장소가
     *
     * https://user.github.io/repository/
     *
     * 형태여도 정상적으로 동작한다.
     */
    const dataUrl =
      new URL(
        REPOSITORY_DATA_PATH,
        document.baseURI,
      ).href;


    /*
     * 캐시 방지
     */
    const url =
      `${dataUrl}?t=${Date.now()}`;


    const response =
      await fetch(
        url,
        {
          method: "GET",
          cache: "no-store",
        },
      );


    if (
      response.status === 404
    ) {
      /*
       * 아직 history.json이 없는 경우
       * 빈 데이터 사용
       */
      appData =
        createEmptyData();

      saveLocalData();

      if (status) {
        status.textContent =
          "GitHub 기록 없음 · 새 데이터";
      }

      return false;
    }


    if (
      !response.ok
    ) {
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


    /*
     * GitHub에 연결할 수 없더라도
     * 기존 브라우저 데이터를 유지한다.
     */
    const hasLocal =
      loadLocalData();


    if (status) {
      status.textContent =
        hasLocal
          ? "GitHub 연결 실패 · 기존 로컬 기록 사용"
          : "GitHub 기록을 불러오지 못했습니다.";
    }


    if (
      showAlert
    ) {
      alert(
        "GitHub 기록을 불러오지 못했습니다.\n기존 브라우저 기록이 있으면 그것을 사용합니다.",
      );
    }


    return false;
  }
}


/* =========================================================
 * 월 키
 * ======================================================= */

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


/* =========================================================
 * 월 파싱
 * ======================================================= */

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


/* =========================================================
 * 날짜
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
 * 최근 6개월
 * ======================================================= */

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
 * 카운트 더하기
 * ======================================================= */

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

    result[worker][job] += 1;
  }

  return result;
}


/* =========================================================
 * 오래된 기록 압축
 * ======================================================= */

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

  const parsed =
    parseMonthKey(
      latestKey,
    );

  if (!parsed) {
    return;
  }

  const keepKeys =
    new Set(
      getRollingMonthKeys(
        parsed.year,
        parsed.month,
      ),
    );

  const oldKeys =
    keys.filter(
      (key) =>
        !keepKeys.has(key),
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
 * 현재 생성 대상 월을 제외한 누적 계산
 * ======================================================= */

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
 * 업무 가능 여부
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
      ...items.slice(0, i),
      ...items.slice(i + 1),
    ];

    const child =
      generatePermutations(
        remaining,
      );

    for (
      const permutation of child
    ) {
      result.push([
        current,
        ...permutation,
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
    const permutation
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

    const workersUsed =
      JOBS.map(
        (job) =>
          candidate[job],
      );

    if (
      new Set(
        workersUsed,
      ).size !== 5
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
 * ======================================================= */

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
 * 특정 카운트
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


/* =========================================================
 * 연속 업무
 * ======================================================= */

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

  let penalty = 0;

  const previous =
    schedule[
      schedule.length - 2
    ];

  const current =
    schedule[
      schedule.length - 1
    ];

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
    let index = 1;
    index <
      schedule.length;
    index += 1
  ) {
    const previous =
      schedule[index - 1];

    const current =
      schedule[index];

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
 * 부분 상태 점수
 * ======================================================= */

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
 * ======================================================= */

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
 * 상태 가지치기
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

  const day = {
    ...dateInfo,
    ...candidate,
  };

  return {
    schedule: [
      ...state.schedule,
      day,
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

    const candidates =
      shuffle(
        dailyCandidates,
      );

    for (
      const state of states
    ) {
      for (
        const candidate
          of candidates
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
 * ======================================================= */

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

      counts[worker][job] += 1;
    }
  }

  return counts;
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
}


/* =========================================================
 * 연차 반영
 * ======================================================= */

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

    /*
     * 연차가 없는 날
     */
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


    /*
     * 연차자의 원래 업무를 비운다.
     */
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


    /*
     * 출근자
     */
    const availableWorkers =
      WORKERS.filter(
        (worker) =>
          !leaveWorkers.includes(
            worker,
          ),
      );


    /*
     * 빈 업무를 대체
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


      /*
       * 중복 업무가 발생할 수 있으므로
       * 실제 결과에는 표시를 분명하게 남긴다.
       */
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

    result.push(day);
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

  /*
   * 우선 당일 아직 배정되지 않은 사람
   */
  const freeWorkers =
    eligible.filter(
      (worker) =>
        !isWorkerAssignedOnDay(
          day,
          worker,
        ),
    );

  const pool =
    freeWorkers.length > 0
      ? freeWorkers
      : eligible;


  /*
   * 현재 저장된 누적값에서 해당 업무가
   * 적은 사람 우선
   */
  let best =
    null;

  let bestScore =
    Infinity;


  for (
    const worker of pool
  ) {
    const count =
      appData.baseline[worker][job] +
      getRecentHistoryJobCount(
        worker,
        job,
      );

    const score =
      count * 100 +
      (
        isWorkerAssignedOnDay(
          day,
          worker,
        )
          ? 50
          : 0
      );


    if (
      score < bestScore
    ) {
      bestScore =
        score;

      best =
        worker;
    }
  }

  return best;
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


function getRecentHistoryJobCount(
  worker,
  job,
) {
  let total = 0;

  for (
    const monthData of Object.values(
      appData.history,
    )
  ) {
    if (
      !monthData ||
      !monthData.originalCounts
    ) {
      continue;
    }

    total +=
      Number(
        monthData.originalCounts[
          worker
        ]?.[job] ?? 0,
      );
  }

  return total;
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
        `${day.month}월 ${day.day}일: 미배정 업무`,
      );

      continue;
    }

    if (
      new Set(
        workers,
      ).size !== 5
    ) {
      errors.push(
        `${day.month}월 ${day.day}일: 작업자 중복`,
      );
    }

    for (
      const job of JOBS
    ) {
      const worker =
        day[job];

      if (
        !isAllowed(
          worker,
          job,
        )
      ) {
        errors.push(
          `${day.month}월 ${day.day}일: ${worker} → ${job} 규칙 위반`,
        );
      }
    }
  }

  return errors;
}


/* =========================================================
 * 텍스트 출력
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
    lines.push(
      `### ${day.month}월 ${day.day}일`,
    );


    const leaveWorkers =
      day.leaveWorkers || [];


    for (
      const worker of WORKERS
    ) {
      if (
        leaveWorkers.includes(
          worker,
        )
      ) {
        const original =
          currentOriginalSchedule.find(
            (item) =>
              item.year ===
                day.year &&
              item.month ===
                day.month &&
              item.day ===
                day.day,
          );


        const originalJob =
          original
            ? getJobForWorker(
                original,
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


      if (job) {
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

        continue;
      }


      lines.push(
        `${worker} → 미배정`,
      );
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
 * 화면 렌더링
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

  updateDataStatus();
}


/* =========================================================
 * 업무별 요약
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

  /*
   * 정상 원래 배정을 기준으로 계산
   */
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
 * 빈 업무 요약
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


  const header =
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
    const title of headers
  ) {
    const th =
      document.createElement(
        "th",
      );

    th.textContent =
      title;

    header.appendChild(
      th,
    );
  }


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


    let total = 0;


    for (
      let index = 1;
      index < values.length;
      index += 1
    ) {
      total +=
        values[index];
    }


    values.push(
      total,
    );


    for (
      let index = 0;
      index < values.length;
      index += 1
    ) {
      const cell =
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
          String(
            values[index],
          );

        cell.appendChild(
          strong,
        );
      } else {
        cell.textContent =
          String(
            values[index],
          );
      }


      row.appendChild(
        cell,
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


  container.innerHTML = "";

  container.appendChild(
    wrapper,
  );
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


  container.innerHTML = "";


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
      workers.join(
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
 * 요약
 * ======================================================= */

function getWorkerGrandTotal(
  counts,
  worker,
) {
  let total = 0;

  for (
    const job of JOBS
  ) {
    total +=
      counts[worker][job];
  }

  return total;
}


/* =========================================================
 * 연차 저장
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


  renderLeaveList();


  input.value = "";


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


  appData.leave = {};

  saveLocalData();

  renderLeaveList();
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


        cleanupOldHistory(
          year,
          month,
        );


        const startingCounts =
          getStartingCounts(
            year,
            month,
          );


        /*
         * 정상 근무 기준 월 전체 최적화
         */
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
         * 연차 반영
         */
        currentSchedule =
          applyLeavesToSchedule(
            originalSchedule,
          );


        /*
         * 기록 저장
         */
        const key =
          getMonthKey(
            year,
            month,
          );


        appData.history[key] =
          {
            schedule:
              originalSchedule,

            originalCounts:
              currentOriginalCounts,

            leave:
              getLeaveMapForMonth(
                year,
                month,
              ),
          };


        saveLocalData();


        cleanupOldHistory(
          year,
          month,
        );


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
    new Date(
      year,
      month,
      0,
    ).getDate();


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
 * 월 연차
 * ======================================================= */

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
 * 데이터 내보내기
 * ======================================================= */

function handleExport() {
  const payload = {
    ...deepClone(
      appData,
    ),

    exportedAt:
      new Date().toISOString(),
  };


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
 * 데이터 복원
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
          "올바른 JSON 백업 파일이 아닙니다.",
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
  const confirmed =
    window.confirm(
      "모든 배정 기록, 누적 데이터, 연차 데이터를 삭제할까요?",
    );


  if (!confirmed) {
    return;
  }


  const second =
    window.confirm(
      "정말 전체 데이터를 삭제하시겠습니까?",
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
 * ======================================================= */

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
 * 복사
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
    console.error(
      error,
    );


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

  return names[weekday];
}


/* =========================================================
 * 초기화
 * ======================================================= */

async function initializeApp() {
  restoreTheme();

  /*
   * 먼저 로컬 기록을 준비
   */
  loadLocalData();

  renderLeaveList();

  renderEmptySummaries();

  updateDataStatus();


  /*
   * GitHub 저장소의 공식 기록을 읽는다.
   */
  await loadRepositoryData(
    false,
  );


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


document.addEventListener(
  "DOMContentLoaded",
  initializeApp,
);
