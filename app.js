"use strict";

/*
 * =========================================================
 * 업무 배정표 자동 생성기
 * =========================================================
 *
 * 데이터 구조
 * ---------------------------------------------------------
 * {
 *   version: 2,
 *   retentionMonths: 6,
 *
 *   baseline: {
 *     "김": {
 *       "볼분리": 0,
 *       "볼분리 보조": 0,
 *       "설거지 및 성형보조": 0,
 *       "분쇄 및 성형보조": 0,
 *       "성형 및 분쇄보조": 0
 *     },
 *     ...
 *   },
 *
 *   history: {
 *     "2026-09": {
 *       schedule: [],
 *       originalCounts: {},
 *       leave: {}
 *     }
 *   }
 * }
 *
 * =========================================================
 */

const STORAGE_KEY =
  "assignment-app-data-v2";

const THEME_KEY =
  "assignment-app-theme";

const DATA_VERSION = 2;

const RETENTION_MONTHS = 6;

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

/*
 * 월 전체 탐색 폭
 */
const BEAM_WIDTH = 3000;

/*
 * 같은 상태에 너무 많은 후보가 몰리는 것을 방지
 */
const MAX_STATES_PER_SIGNATURE = 2;

let appData = createEmptyData();

let currentSchedule = [];

let currentOriginalSchedule = [];

let currentOriginalCounts = null;

let copiedText = "";


/* =========================================================
 * 기본 데이터
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

function createEmptyData() {
  return {
    version: DATA_VERSION,
    retentionMonths: RETENTION_MONTHS,
    baseline: createEmptyWorkerCounts(),
    history: {},
    leave: {},
  };
}

function deepClone(value) {
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
    typeof input !== "object"
  ) {
    return result;
  }

  for (const worker of WORKERS) {
    if (
      !input[worker] ||
      typeof input[worker] !==
        "object"
    ) {
      continue;
    }

    for (const job of JOBS) {
      const value =
        Number(
          input[worker][job],
        );

      result[worker][job] =
        Number.isFinite(value) &&
        value >= 0
          ? Math.floor(value)
          : 0;
    }
  }

  return result;
}

function normalizeHistory(
  history,
) {
  const result = {};

  if (
    !history ||
    typeof history !== "object"
  ) {
    return result;
  }

  for (
    const [monthKey, monthData]
      of Object.entries(history)
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
      typeof monthData !== "object"
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

function normalizeLeaveMap(
  input,
) {
  const result = {};

  if (
    !input ||
    typeof input !== "object"
  ) {
    return result;
  }

  for (
    const [dateKey, workers]
      of Object.entries(input)
  ) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        dateKey,
      )
    ) {
      continue;
    }

    if (
      !Array.isArray(workers)
    ) {
      continue;
    }

    result[dateKey] =
      WORKERS.filter(
        (worker) =>
          workers.includes(worker),
      );
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
    typeof input !== "object"
  ) {
    return result;
  }

  result.version =
    Number.isInteger(
      input.version,
    )
      ? input.version
      : DATA_VERSION;

  result.retentionMonths =
    Number.isInteger(
      input.retentionMonths,
    ) &&
    input.retentionMonths > 0
      ? input.retentionMonths
      : RETENTION_MONTHS;

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

function loadData() {
  try {
    const raw =
      localStorage.getItem(
        STORAGE_KEY,
      );

    if (!raw) {
      appData =
        createEmptyData();

      return;
    }

    const parsed =
      JSON.parse(raw);

    appData =
      normalizeData(
        parsed,
      );
  } catch (error) {
    console.error(
      "데이터 불러오기 실패:",
      error,
    );

    appData =
      createEmptyData();
  }

  cleanupOldHistory();
}

function saveData() {
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
      "데이터 저장 실패:",
      error,
    );

    alert(
      "브라우저에 데이터를 저장하지 못했습니다.",
    );
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
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
  ].join("-");
}

function parseMonthKey(
  monthKey,
) {
  const [
    year,
    month,
  ] = monthKey
    .split("-")
    .map(Number);

  return {
    year,
    month,
  };
}

function compareMonthKeys(
  a,
  b,
) {
  return a.localeCompare(
    b,
  );
}


/* =========================================================
 * 최근 6개월 기준
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
    year: date.getFullYear(),
    month: date.getMonth() + 1,
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
 * 오래된 기록 정리
 *
 * 상세 기록은 최근 6개월만 보존.
 *
 * 오래된 달의 originalCounts는 baseline에 합산한 뒤 삭제.
 * ======================================================= */

function cleanupOldHistory(
  referenceYear = null,
  referenceMonth = null,
) {
  const historyKeys =
    Object.keys(
      appData.history,
    );

  if (
    historyKeys.length === 0
  ) {
    return;
  }

  let referenceKey;

  if (
    referenceYear &&
    referenceMonth
  ) {
    referenceKey =
      getMonthKey(
        referenceYear,
        referenceMonth,
      );
  } else {
    referenceKey =
      historyKeys.sort(
        compareMonthKeys,
      )[historyKeys.length - 1];
  }

  const {
    year,
    month,
  } = parseMonthKey(
    referenceKey,
  );

  const keepKeys =
    new Set(
      getRollingMonthKeys(
        year,
        month,
      ),
    );

  const oldKeys =
    Object.keys(
      appData.history,
    ).filter(
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
      appData.history[key];

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

  saveData();
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
 * 하루 가능한 정상 배정
 * ======================================================= */

function generateDailyCandidates() {
  const candidates = [];

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

    candidates.push(
      candidate,
    );
  }

  return candidates;
}


/* =========================================================
 * 업무별/작업자별 카운트
 * ======================================================= */

function addAssignmentToCounts(
  counts,
  assignment,
) {
  const result =
    deepClone(
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

function addWorkerCounts(
  base,
  extra,
) {
  const result =
    normalizeWorkerCounts(
      base,
    );

  const normalizedExtra =
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
        normalizedExtra[worker][job];
    }
  }

  return result;
}

function combineCounts(
  first,
  second,
) {
  return addWorkerCounts(
    first,
    second,
  );
}


/* =========================================================
 * 시작 누적 카운트
 *
 * baseline + 최근 6개월 기록
 * 단, 현재 생성 대상 월은 제외.
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

  const monthKeys =
    Object.keys(
      appData.history,
    ).sort(
      compareMonthKeys,
    );

  for (
    const monthKey of monthKeys
  ) {
    if (
      monthKey === targetKey
    ) {
      continue;
    }

    const monthData =
      appData.history[
        monthKey
      ];

    if (
      !monthData ||
      !monthData.originalCounts
    ) {
      continue;
    }

    counts =
      combineCounts(
        counts,
        monthData.originalCounts,
      );
  }

  return counts;
}


/* =========================================================
 * 현재 월 기존 기록이 있으면 삭제 전 시작 누적에서 제외
 * ======================================================= */

function removeMonthFromCounts(
  counts,
) {
  return normalizeWorkerCounts(
    counts,
  );
}


/* =========================================================
 * 업무별 횟수
 * ======================================================= */

function getJobCountsFromWorkerCounts(
  workerCounts,
) {
  const result =
    createEmptyJobCounts();

  for (
    const worker of WORKERS
  ) {
    for (
      const job of JOBS
    ) {
      result[job] +=
        workerCounts[worker][job];
    }
  }

  return result;
}


/* =========================================================
 * 범위
 * ======================================================= */

function getRange(values) {
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
 * 균형 점수
 * ======================================================= */

function getBowlCounts(
  counts,
) {
  return MAIN_WORKERS.map(
    (worker) =>
      counts[worker]["볼분리"],
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
      schedule.length - 1
    ];

  const current =
    schedule[
      schedule.length - 2
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


/* =========================================================
 * 상태 점수
 * ======================================================= */

function calculatePartialScore(
  state,
  remainingDays,
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

  /*
   * 남은 날짜가 있는 상태에서는
   * 완성된 월보다 약간 약하게 평가한다.
   */
  const horizonFactor =
    Math.max(
      1,
      remainingDays,
    );

  return (
    bowlRange * 1000000 +
    helperRange * 100000 +
    liuRange * 10000 +
    mainExtraRange * 1000 +
    parkRange * 500 +
    consecutive * 10 +
    horizonFactor * 0.001
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

  /*
   * 1순위
   * 김/탁/임 볼분리 횟수
   */
  const bowlRange =
    getRange(
      getBowlCounts(
        counts,
      ),
    );

  /*
   * 2순위
   * 김/탁/임 볼분리 보조
   */
  const helperRange =
    getRange(
      getBowlHelperCounts(
        counts,
      ),
    );

  /*
   * 3순위
   * 류 세 업무
   */
  const liuCounts =
    getLiuCounts(
      counts,
    );

  const liuRange =
    getRange(
      liuCounts,
    );

  /*
   * 4순위
   * 박 두 업무
   */
  const parkCounts =
    getParkCounts(
      counts,
    );

  const parkRange =
    getRange(
      parkCounts,
    );

  /*
   * 5순위
   * 김/탁/임 나머지 업무량
   */
  const mainExtraRange =
    getRange(
      getMainExtraCounts(
        counts,
      ),
    );

  /*
   * 6순위
   * 전체 업무별 김/탁/임 편중
   */
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

  /*
   * 류 분산 제곱편차
   */
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

  /*
   * 박 분산 제곱편차
   */
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
 * 시그니처
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
  remainingDays,
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
        remainingDays,
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
    .slice(0, BEAM_WIDTH)
    .map(
      (item) =>
        item.state,
    );
}


/* =========================================================
 * 상태에 배정 추가
 * ======================================================= */

function addCandidateToState(
  state,
  candidate,
  dateInfo,
) {
  const nextCounts =
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
    counts:
      nextCounts,
    lastAssignment:
      candidate,
  };
}


/* =========================================================
 * 월 전체 최적화
 *
 * "정상 근무 기준" 배정을 먼저 최적화한다.
 * 연차 대체는 그 결과를 바탕으로 별도 처리한다.
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
      "현재 설정된 규칙으로 가능한 하루 배정이 없습니다.",
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
      lastAssignment: null,
    },
  ];

  for (
    let index = 0;
    index < dates.length;
    index += 1
  ) {
    const dateInfo =
      dates[index];

    const remainingDays =
      dates.length -
      index -
      1;

    const nextStates = [];

    const shuffled =
      shuffle(
        dailyCandidates,
      );

    for (
      const state of states
    ) {
      for (
        const candidate
          of shuffled
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
        remainingDays,
      );
  }

  if (
    states.length === 0
  ) {
    throw new Error(
      "월 전체 배정 후보를 만들지 못했습니다.",
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
 * 날짜 유틸
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
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
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
        prefix + "-",
      )
    ) {
      result[dateKey] = [
        ...workers,
      ];
    }
  }

  return result;
}

function saveLeaveData() {
  appData.leave =
    normalizeLeaveMap(
      appData.leave,
    );

  saveData();
  renderLeaveList();
}


/* =========================================================
 * 연차가 있는 날짜의 실제 배정 처리
 *
 * 1. 원래 월 전체 배정은 그대로 기록
 * 2. 연차자를 실제 업무표에서는 제외
 * 3. 비어버린 업무를 출근자에게 대체 배정
 *
 * 연차자의 원래 업무는 누적 횟수에서
 * 수행한 것으로 계산한다.
 * ======================================================= */

function applyLeavesToSchedule(
  originalSchedule,
) {
  const actualSchedule =
    [];

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
     * 연차가 없으면 그대로 사용
     */
    if (
      leaveWorkers.length === 0
    ) {
      actualSchedule.push(
        {
          ...originalDay,
          leaveWorkers: [],
          replacements: {},
        },
      );

      continue;
    }

    const actualDay =
      {
        ...originalDay,
        leaveWorkers:
          leaveWorkers.slice(),
        replacements: {},
      };

    /*
     * 연차자가 원래 맡았던 업무를
     * 실제 배정에서는 비운다.
     */
    const vacantJobs = [];

    for (
      const job of JOBS
    ) {
      const originalWorker =
        originalDay[job];

      if (
        leaveWorkers.includes(
          originalWorker,
        )
      ) {
        delete actualDay[job];

        vacantJobs.push(
          {
            job,
            originalWorker,
          },
        );
      }
    }

    /*
     * 출근 가능한 사람 목록
     */
    const availableWorkers =
      WORKERS.filter(
        (worker) =>
          !leaveWorkers.includes(
            worker,
          ),
      );

    /*
     * 빈 업무를 하나씩 대체한다.
     *
     * 추가 업무가 가능한 작업자 중에서
     * 현재 누적 횟수가 상대적으로 적은 사람을 우선한다.
     */
    for (
      const vacant of vacantJobs
    ) {
      const worker =
        chooseReplacementWorker(
          availableWorkers,
          vacant.job,
          actualDay,
          originalDay,
        );

      if (!worker) {
        actualDay.replacements[
          vacant.job
        ] = null;

        continue;
      }

      actualDay[vacant.job] =
        worker;

      actualDay.replacements[
        vacant.job
      ] = {
        originalWorker:
          vacant.originalWorker,
        replacementWorker:
          worker,
      };
    }

    actualSchedule.push(
      actualDay,
    );
  }

  return actualSchedule;
}

function chooseReplacementWorker(
  availableWorkers,
  job,
  actualDay,
  originalDay,
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
   * 당일 이미 같은 사람이 하나 이상의 업무를
   * 맡았더라도 연차 대체 상황에서는 중복을 허용한다.
   *
   * 단, 가능하면 아직 업무가 없는 사람을 우선.
   */
  const withoutCurrentJob =
    eligible.filter(
      (worker) =>
        !isWorkerAssignedOnDay(
          actualDay,
          worker,
        ),
    );

  const pool =
    withoutCurrentJob.length >
    0
      ? withoutCurrentJob
      : eligible;

  /*
   * 현재 월 생성 결과의 원래 누적치를 기준으로
   * 해당 업무 횟수가 적은 사람부터 고른다.
   */
  let bestWorker = null;
  let bestScore = Infinity;

  for (
    const worker of pool
  ) {
    const count =
      currentOriginalCounts
        ?. [worker]
        ?.[job] ?? 0;

    /*
     * 당일 다른 업무를 이미 맡았다면
     * 대체 업무에 대한 작은 패널티를 준다.
     */
    const alreadyAssigned =
      isWorkerAssignedOnDay(
        actualDay,
        worker,
      );

    const score =
      count * 100 +
      (alreadyAssigned
        ? 10
        : 0);

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
        `${day.month}월 ${day.day}일: 미배정 업무가 있습니다.`,
      );

      continue;
    }

    if (
      new Set(
        workers,
      ).size !== 5
    ) {
      errors.push(
        `${day.month}월 ${day.day}일: 작업자 중복 배정`,
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
 * 텍스트
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

    const replacements =
      day.replacements || {};

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
            currentOriginalSchedule.find(
              (item) =>
                item.year ===
                  day.year &&
                item.month ===
                  day.month &&
                item.day ===
                  day.day,
            ) || {},
            worker,
          );

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
        lines.push(
          `${worker} → ${job}`,
        );

        continue;
      }

      /*
       * 연차 대체 업무를 담당했지만
       * 원래 직무로 조회되지 않는 경우
       */
      const replacementJob =
        JOBS.find(
          (candidateJob) =>
            replacements[
              candidateJob
            ]
              ?.replacementWorker ===
            worker,
        );

      if (
        replacementJob
      ) {
        lines.push(
          `${worker} → ${replacementJob} (연차 대체)`,
        );
      } else {
        lines.push(
          `${worker} → 미배정`,
        );
      }
    }

    /*
     * 당일 대체 업무를 별도로 표시
     */
    const replacementEntries =
      Object.entries(
        replacements,
      );

    if (
      replacementEntries.length > 0
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
            `${job} → 대체자 없음`,
          );

          continue;
        }

        lines.push(
          `${job}: ${replacement.originalWorker} 연차 → ${replacement.replacementWorker} 대체`,
        );
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}


/* =========================================================
 * 현재 월의 원래 횟수 저장
 *
 * 연차 대체 여부와 상관없이
 * 원래 정상 배정을 수행한 것으로 기록한다.
 * ======================================================= */

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
 * 기존 대상 월 기록 제거 후 생성
 * ======================================================= */

function removeCurrentMonthHistory(
  year,
  month,
) {
  const key =
    getMonthKey(
      year,
      month,
    );

  /*
   * 기존 기록이 있더라도 baseline으로 옮기지 않는다.
   *
   * 현재 월을 다시 생성하는 것이므로
   * 먼저 기존 월의 카운트를 시작점에서 제외해야 한다.
   */
  delete appData.history[
    key
  ];
}


/* =========================================================
 * 데이터 저장
 * ======================================================= */

function saveCurrentMonthHistory(
  year,
  month,
  originalSchedule,
  originalCounts,
) {
  const key =
    getMonthKey(
      year,
      month,
    );

  const leave =
    getLeaveMapForMonth(
      year,
      month,
    );

  appData.history[key] = {
    schedule:
      originalSchedule,
    originalCounts:
      originalCounts,
    leave:
      leave,
  };

  /*
   * 가장 최신 월을 기준으로
   * 최근 6개월만 상세 보존
   */
  cleanupOldHistory(
    year,
    month,
  );

  saveData();
}


/* =========================================================
 * 렌더링
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
    const day of currentSchedule
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

function renderWorkerSummary() {
  const container =
    document.getElementById(
      "workerSummaryContainer",
    );

  if (!container) {
    return;
  }

  const counts =
    createEmptyWorkerCounts();

  /*
   * 연차자의 원래 업무 포함
   */
  for (
    const day of currentOriginalSchedule
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

  const row =
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

    row.appendChild(
      th,
    );
  }

  thead.appendChild(
    row,
  );

  const tbody =
    document.createElement(
      "tbody",
    );

  for (
    const worker of WORKERS
  ) {
    const tr =
      document.createElement(
        "tr",
      );

    let total = 0;

    const values = [
      worker,
      counts[worker]["볼분리"],
      counts[worker]["볼분리 보조"],
      counts[worker]["설거지 및 성형보조"],
      counts[worker]["분쇄 및 성형보조"],
      counts[worker]["성형 및 분쇄보조"],
    ];

    for (
      let i = 1;
      i < values.length;
      i += 1
    ) {
      total +=
        Number(
          values[i],
        );
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

      tr.appendChild(
        td,
      );
    }

    tbody.appendChild(
      tr,
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
    validateOriginalSchedule(
      currentOriginalSchedule,
    );

  copiedText =
    formatScheduleAsText(
      currentSchedule,
    );

  resultElement.textContent =
    copiedText;

  if (statusElement) {
    if (
      errors.length === 0
    ) {
      statusElement.textContent =
        `${currentOriginalSchedule.length}일 생성 완료 · 월 전체 최적화 · 규칙 검증 통과`;

      statusElement.classList.add(
        "success",
      );
    } else {
      statusElement.textContent =
        `검증 오류 ${errors.length}건`;

      statusElement.classList.remove(
        "success",
      );

      resultElement.textContent +=
        "\n\n[검증 오류]\n" +
        errors.join("\n");
    }
  }

  renderJobSummary();
  renderWorkerSummary();
  updateDataStatus();
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
      (
        a,
        b,
      ) =>
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

        saveLeaveData();
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
 * 데이터 상태 표시
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

  const baselineCount =
    Object.values(
      appData.baseline,
    ).reduce(
      (sum, workerCounts) =>
        sum +
        Object.values(
          workerCounts,
        ).reduce(
          (workerSum, value) =>
            workerSum + value,
          0,
        ),
      0,
    );

  if (
    historyCount === 0 &&
    baselineCount === 0
  ) {
    element.textContent =
      "누적 데이터 없음";

    return;
  }

  element.textContent =
    `상세 기록 ${historyCount}개월 · 압축 누적 ${baselineCount}건`;
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
 * 자동 배정 버튼
 * ======================================================= */

function handleGenerate() {
  try {
    const {
      year,
      month,
      startDay,
      endDay,
    } = readDateInputs();

    const statusElement =
      document.getElementById(
        "statusText",
      );

    if (statusElement) {
      statusElement.textContent =
        "월 전체 최적화 중...";

      statusElement.classList.remove(
        "success",
      );
    }

    window.setTimeout(
      () => {
        try {
          /*
           * 대상 월을 다시 생성할 경우
           * 해당 월의 기존 기록은 시작 누적에서 제외해야 한다.
           *
           * 따라서 먼저 현재 저장 데이터에서
           * 대상 월을 제외한 누적값을 계산한다.
           */
          const targetKey =
            getMonthKey(
              year,
              month,
            );

          const existingCurrentMonth =
            appData.history[
              targetKey
            ];

          let startingCounts =
            getStartingCounts(
              year,
              month,
            );

          if (
            existingCurrentMonth &&
            existingCurrentMonth.originalCounts
          ) {
            /*
             * getStartingCounts()는 현재 월을 이미
             * 제외하므로 별도 작업이 필요 없다.
             */
            startingCounts =
              normalizeWorkerCounts(
                startingCounts,
              );
          }

          /*
           * 대상 월의 오래된 기록을 정리하기 전에
           * 최신 기준으로 최근 6개월만 유지한다.
           */
          cleanupOldHistory(
            year,
            month,
          );

          /*
           * 월 전체 정상 배정
           */
          const originalSchedule =
            optimizeMonth(
              year,
              month,
              startDay,
              endDay,
              startingCounts,
            );

          /*
           * 연차 반영
           */
          currentOriginalSchedule =
            originalSchedule;

          currentOriginalCounts =
            calculateOriginalCounts(
              originalSchedule,
            );

          currentSchedule =
            applyLeavesToSchedule(
              originalSchedule,
            );

          /*
           * 저장
           *
           * 중요:
           * 연차 대체 결과가 아니라
           * 정상 배정 결과를 누적 기록으로 사용한다.
           */
          saveCurrentMonthHistory(
            year,
            month,
            originalSchedule,
            currentOriginalCounts,
          );

          renderSchedule();
        } catch (error) {
          console.error(
            error,
          );

          const statusElement =
            document.getElementById(
              "statusText",
            );

          if (statusElement) {
            statusElement.textContent =
              "배정 실패";

            statusElement.classList.remove(
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
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "입력값을 확인해주세요.",
    );
  }
}


/* =========================================================
 * 연차 저장
 * ======================================================= */

function handleSaveLeave() {
  const input =
    document.getElementById(
      "leaveDateInput",
    );

  if (!input || !input.value) {
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

  saveLeaveData();

  /*
   * 입력값 초기화
   */
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

  saveLeaveData();
}

function saveLeaveData() {
  appData.leave =
    normalizeLeaveMap(
      appData.leave,
    );

  saveData();
  renderLeaveList();
}


/* =========================================================
 * 데이터 백업
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

  link.href = url;

  link.download =
    `assignment-data-${getFileDateString()}.json`;

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
    ).padStart(2, "0"),
    String(
      date.getDate(),
    ).padStart(2, "0"),
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

  reader.onload = () => {
    try {
      const parsed =
        JSON.parse(
          reader.result,
        );

      appData =
        normalizeData(
          parsed,
        );

      cleanupOldHistory();

      saveData();

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
      event.target.value = "";
    }
  };

  reader.onerror = () => {
    alert(
      "파일을 읽지 못했습니다.",
    );

    event.target.value = "";
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
      "모든 배정 기록, 누적 데이터, 연차 데이터를 삭제할까요?\n\n이 작업은 되돌릴 수 없습니다.",
    );

  if (!confirmed) {
    return;
  }

  const secondConfirm =
    window.confirm(
      "정말 전체 데이터를 삭제하시겠습니까?",
    );

  if (!secondConfirm) {
    return;
  }

  appData =
    createEmptyData();

  currentSchedule = [];
  currentOriginalSchedule = [];
  currentOriginalCounts = null;
  copiedText = "";

  saveData();

  renderLeaveList();

  const resultElement =
    document.getElementById(
      "resultText",
    );

  if (resultElement) {
    resultElement.textContent =
      "";
  }

  const statusElement =
    document.getElementById(
      "statusText",
    );

  if (statusElement) {
    statusElement.textContent =
      "아직 생성되지 않았습니다.";

    statusElement.classList.remove(
      "success",
    );
  }

  renderEmptySummaries();

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

  const workerSummary =
    document.getElementById(
      "workerSummaryContainer",
    );

  if (workerSummary) {
    workerSummary.innerHTML = `
      <div class="empty-state">
        배정표를 생성하면 작업자별 횟수가 표시됩니다.
      </div>
    `;
  }
}


/* =========================================================
 * 복사
 * ======================================================= */

async function handleCopy() {
  if (
    !copiedText
  ) {
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

    textarea.style.top =
      "0";

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
  const savedTheme =
    localStorage.getItem(
      THEME_KEY,
    );

  if (
    savedTheme === "dark"
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
 * 공통
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

function initializeApp() {
  loadData();

  restoreTheme();

  renderLeaveList();

  updateDataStatus();

  renderEmptySummaries();

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

  const themeButton =
    document.getElementById(
      "themeToggle",
    );

  if (themeButton) {
    themeButton.addEventListener(
      "click",
      handleThemeToggle,
    );
  }

  const saveLeaveButton =
    document.getElementById(
      "saveLeaveButton",
    );

  if (saveLeaveButton) {
    saveLeaveButton.addEventListener(
      "click",
      handleSaveLeave,
    );
  }

  const clearLeaveButton =
    document.getElementById(
      "clearLeaveButton",
    );

  if (clearLeaveButton) {
    clearLeaveButton.addEventListener(
      "click",
      handleClearLeaves,
    );
  }

  const exportButton =
    document.getElementById(
      "exportButton",
    );

  if (exportButton) {
    exportButton.addEventListener(
      "click",
      handleExport,
    );
  }

  const importInput =
    document.getElementById(
      "importInput",
    );

  if (importInput) {
    importInput.addEventListener(
      "change",
      handleImport,
    );
  }

  const clearDataButton =
    document.getElementById(
      "clearDataButton",
    );

  if (clearDataButton) {
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
