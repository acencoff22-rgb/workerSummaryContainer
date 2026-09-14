"use strict";

import {
  BEAM_WIDTH,
  MAX_STATES_PER_SIGNATURE,
  WORKERS,
  JOBS,
  MAIN_WORKERS,
  LIU_JOBS,
  PARK_ALLOWED_JOBS,
  RETENTION_MONTHS,
} from "./config.js";

import {
  appData,
  setAppData,
} from "./state.js";

import {
  addWorkerCounts,
  normalizeWorkerCounts,
} from "./data.js";

import {
  getDateInfo,
  getMonthKey,
  getRollingMonthKeys,
  generatePermutations,
  getRange,
} from "./utils.js";


/* =========================================================
 * 빠른 카운트 적용
 * ======================================================= */

function applyAssignmentFast(
  counts,
  assignment,
) {
  const result = {};

  for (const worker of WORKERS) {
    result[worker] = {
      ...counts[worker],
    };
  }

  for (const job of JOBS) {
    const worker =
      assignment[job];

    if (
      worker &&
      result[worker]
    ) {
      result[worker][job] += 1;
    }
  }

  return result;
}


/* =========================================================
 * 업무 제한
 * ======================================================= */

export function isAllowed(
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

  if (worker === "박") {
    return PARK_ALLOWED_JOBS.includes(
      job,
    );
  }

  if (worker === "류") {
    return LIU_JOBS.includes(
      job,
    );
  }

  return true;
}


/* =========================================================
 * 하루 후보
 * ======================================================= */

export function createDailyCandidates() {
  const result = [];

  const permutations =
    generatePermutations(
      WORKERS,
    );

  for (
    const workerOrder of permutations
  ) {
    const candidate = {};
    let valid = true;

    for (
      let index = 0;
      index < JOBS.length;
      index += 1
    ) {
      const job =
        JOBS[index];

      const worker =
        workerOrder[index];

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

    if (valid) {
      result.push(candidate);
    }
  }

  return result;
}


/* =========================================================
 * 작업자별 업무
 * ======================================================= */

export function getJobForWorker(
  day,
  worker,
) {
  for (const job of JOBS) {
    if (day?.[job] === worker) {
      return job;
    }
  }

  return null;
}


/* =========================================================
 * 누적 시작값
 * ======================================================= */

export function getStartingCountsForMonth(
  year,
  month,
) {
  let counts =
    normalizeWorkerCounts(
      appData.baseline,
    );

  const targetMonth =
    getMonthKey(
      year,
      month,
    );

  const rollingKeys =
    new Set(
      getRollingMonthKeys(
        year,
        month,
        RETENTION_MONTHS,
      ),
    );

  for (
    const [
      monthKey,
      monthData,
    ] of Object.entries(
      appData.history || {},
    )
  ) {
    if (monthKey === targetMonth) {
      continue;
    }

    if (!rollingKeys.has(monthKey)) {
      continue;
    }

    if (!monthData?.originalCounts) {
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
 * 균형 계산
 * ======================================================= */

function getBowlRange(counts) {
  return getRange(
    MAIN_WORKERS.map(
      (worker) =>
        counts[worker]["볼분리"],
    ),
  );
}


function getBowlHelperRange(counts) {
  return getRange(
    MAIN_WORKERS.map(
      (worker) =>
        counts[worker]["볼분리 보조"],
    ),
  );
}


function getMainJobBalance(counts) {
  let total = 0;

  for (const job of JOBS) {
    total += getRange(
      MAIN_WORKERS.map(
        (worker) =>
          counts[worker][job],
      ),
    );
  }

  return total;
}


function getMainJobVariance(counts) {
  let total = 0;

  for (const job of JOBS) {
    const values =
      MAIN_WORKERS.map(
        (worker) =>
          counts[worker][job],
      );

    const average =
      values.reduce(
        (sum, value) =>
          sum + value,
        0,
      ) /
      values.length;

    for (const value of values) {
      total +=
        Math.pow(
          value - average,
          2,
        );
    }
  }

  return total;
}


function getParkRange(counts) {
  return getRange(
    PARK_ALLOWED_JOBS.map(
      (job) =>
        counts["박"][job],
    ),
  );
}


function getLiuRange(counts) {
  return getRange(
    LIU_JOBS.map(
      (job) =>
        counts["류"][job],
    ),
  );
}


function getMainExtraRange(counts) {
  const values =
    MAIN_WORKERS.map(
      (worker) => {
        let total = 0;

        for (const job of LIU_JOBS) {
          total +=
            counts[worker][job];
        }

        return total;
      },
    );

  return getRange(values);
}


/* =========================================================
 * 연속 업무
 * ======================================================= */

function calculateDayPairConsecutivePenalty(
  previous,
  current,
) {
  if (!previous) {
    return 0;
  }

  let penalty = 0;

  for (const job of JOBS) {
    if (
      previous[job] &&
      previous[job] === current[job]
    ) {
      penalty += 1;
    }
  }

  return penalty;
}


/* =========================================================
 * 부분 점수
 * ======================================================= */

function calculatePartialScore(state) {
  const counts =
    state.counts;

  const bowlRange =
    getBowlRange(counts);

  const helperRange =
    getBowlHelperRange(counts);

  const mainJobBalance =
    getMainJobBalance(counts);

  const parkRange =
    getParkRange(counts);

  const liuRange =
    getLiuRange(counts);

  const mainExtraRange =
    getMainExtraRange(counts);

  return (
    bowlRange * 1000000000 +
    helperRange * 10000000 +
    mainJobBalance * 100000 +
    parkRange * 10000 +
    liuRange * 1000 +
    mainExtraRange * 100 +
    state.consecutivePenalty
  );
}


/* =========================================================
 * 최종 점수
 * ======================================================= */

function calculateFinalScore(state) {
  const counts =
    state.counts;

  const bowlRange =
    getBowlRange(counts);

  const helperRange =
    getBowlHelperRange(counts);

  const mainJobBalance =
    getMainJobBalance(counts);

  const mainJobVariance =
    getMainJobVariance(counts);

  const parkRange =
    getParkRange(counts);

  const liuRange =
    getLiuRange(counts);

  const mainExtraRange =
    getMainExtraRange(counts);

  return (
    /* 1. 볼분리 균등 */
    bowlRange * 1000000000000 +

    /* 2. 볼분리 보조 균등 */
    helperRange * 10000000000 +

    /* 3. 김/탁/임 업무별 균등 */
    mainJobBalance * 100000000 +

    /* 4. 김/탁/임 세부 분포 */
    mainJobVariance * 1000000 +

    /* 5. 박 균등 */
    parkRange * 10000 +

    /* 6. 류 균등 */
    liuRange * 1000 +

    /* 7. 추가업무 총량 균등 */
    mainExtraRange * 100 +

    /* 8. 연속 동일업무 */
    state.consecutivePenalty
  );
}


/* =========================================================
 * 상태 시그니처
 * ======================================================= */

function createStateSignature(state) {
  const counts =
    state.counts;

  const mainJobs =
    JOBS.map(
      (job) =>
        MAIN_WORKERS.map(
          (worker) =>
            counts[worker][job],
        ).join(","),
    ).join(";");

  const park =
    PARK_ALLOWED_JOBS.map(
      (job) =>
        counts["박"][job],
    ).join(",");

  const liu =
    LIU_JOBS.map(
      (job) =>
        counts["류"][job],
    ).join(",");

  let last = "";

  if (state.lastAssignment) {
    last =
      JOBS.map(
        (job) =>
          state.lastAssignment[job],
      ).join(",");
  }

  return [
    mainJobs,
    park,
    liu,
    last,
  ].join("|");
}


/* =========================================================
 * 가지치기
 * ======================================================= */

function pruneStates(states) {
  const grouped =
    new Map();

  for (const state of states) {
    const signature =
      createStateSignature(
        state,
      );

    const score =
      calculatePartialScore(
        state,
      );

    const group =
      grouped.get(signature) || [];

    group.push({
      state,
      score,
    });

    group.sort(
      (a, b) =>
        a.score - b.score,
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

  for (const group of grouped.values()) {
    flattened.push(...group);
  }

  flattened.sort(
    (a, b) =>
      a.score - b.score,
  );

  return flattened
    .slice(0, BEAM_WIDTH)
    .map(
      (item) =>
        item.state,
    );
}


/* =========================================================
 * 월 전체 최적화
 * ======================================================= */

export function optimizeMonth(
  year,
  month,
  startDay,
  endDay,
  startingCounts,
) {
  const dailyCandidates =
    createDailyCandidates();

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

      consecutivePenalty:
        0,
    },
  ];

  for (
    let index = 0;
    index < dates.length;
    index += 1
  ) {
    const nextStates = [];

    for (const state of states) {
      for (
        const candidate of dailyCandidates
      ) {
        const nextCounts =
          applyAssignmentFast(
            state.counts,
            candidate,
          );

        const pairPenalty =
          calculateDayPairConsecutivePenalty(
            state.lastAssignment,
            candidate,
          );

        nextStates.push({
          schedule: [
            ...state.schedule,

            {
              ...dates[index],
              ...candidate,
            },
          ],

          counts:
            nextCounts,

          lastAssignment:
            candidate,

          consecutivePenalty:
            state.consecutivePenalty +
            pairPenalty,
        });
      }
    }

    states =
      pruneStates(
        nextStates,
      );

    if (states.length === 0) {
      throw new Error(
        `${month}월 ${dates[index]?.day ?? ""}일 배정 후보를 찾을 수 없습니다.`,
      );
    }
  }

  states.sort(
    (a, b) =>
      calculateFinalScore(a) -
      calculateFinalScore(b),
  );

  return states[0].schedule;
}


/* =========================================================
 * 배정표 검증
 * ======================================================= */

export function validateOriginalSchedule(
  schedule,
  getWorkerLabel = (worker) => worker,
  getJobLabel = (job) => job,
) {
  const errors = [];

  if (!Array.isArray(schedule)) {
    return [
      "배정표 데이터가 올바르지 않습니다.",
    ];
  }

  for (const day of schedule) {
    const assignedWorkers =
      JOBS.map(
        (job) =>
          day?.[job],
      );

    if (
      assignedWorkers.some(
        (worker) =>
          !worker,
      )
    ) {
      errors.push(
        `${day?.month ?? "?"}월 ${day?.day ?? "?"}일: 미배정 업무`,
      );

      continue;
    }

    if (
      new Set(
        assignedWorkers,
      ).size !== WORKERS.length
    ) {
      errors.push(
        `${day.month}월 ${day.day}일: 작업자 중복`,
      );
    }

    for (const job of JOBS) {
      const worker =
        day[job];

      if (
        !isAllowed(
          worker,
          job,
        )
      ) {
        errors.push(
          `${day.month}월 ${day.day}일: ${getWorkerLabel(worker)} → ${getJobLabel(job)} 규칙 위반`,
        );
      }
    }
  }

  return errors;
}


/* =========================================================
 * 오래된 기록 정리
 * ======================================================= */

export function cleanupOldHistory(
  referenceYear,
  referenceMonth,
) {
  const history =
    appData.history || {};

  const keep =
    new Set(
      getRollingMonthKeys(
        referenceYear,
        referenceMonth,
        RETENTION_MONTHS,
      ),
    );

  let baseline =
    normalizeWorkerCounts(
      appData.baseline,
    );

  const nextHistory = {
    ...history,
  };

  let changed = false;

  for (
    const [
      monthKey,
      monthData,
    ] of Object.entries(history)
  ) {
    if (keep.has(monthKey)) {
      continue;
    }

    if (monthData?.originalCounts) {
      baseline =
        addWorkerCounts(
          baseline,
          monthData.originalCounts,
        );
    }

    delete nextHistory[monthKey];

    changed = true;
  }

  if (!changed) {
    return false;
  }

  setAppData({
    ...appData,
    baseline,
    history: nextHistory,
  });

  return true;
}
