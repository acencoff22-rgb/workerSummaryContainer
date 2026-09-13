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
  addAssignmentToCounts,
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

    if (!valid) {
      continue;
    }

    result.push(candidate);
  }

  return result;
}


export function getJobForWorker(
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
      counts[worker]["볼분리 보조"],
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
    let index = 1;
    index < schedule.length;
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
        previousJob === currentJob
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
          value - liuAverage,
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
          value - parkAverage,
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
          state.lastAssignment[job],
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


/*
 * 현재 배정 대상 월의 누적 시작값을 계산한다.
 *
 * baseline:
 *   이미 retention 기간 밖으로 이동된 누적값
 *
 * history:
 *   현재 상세 보관 중인 이전 월들의 originalCounts
 *
 * target month:
 *   현재 새로 계산하는 월이므로 기존 기록은 제외
 */
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
    if (
      monthKey === targetMonth
    ) {
      continue;
    }

    /*
     * 현재 기준 최근 6개월 범위 밖의
     * history 데이터가 혹시 남아 있더라도
     * 다시 더하지 않는다.
     *
     * 정상 데이터에서는 cleanupOldHistory()
     * 때문에 거의 발생하지 않는다.
     */
    if (
      !rollingKeys.has(monthKey)
    ) {
      continue;
    }

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

      lastAssignment: null,
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
        const candidate of dailyCandidates
      ) {
        const nextSchedule = [
          ...state.schedule,
          {
            ...dates[index],
            ...candidate,
          },
        ];

        const nextCounts =
          addAssignmentToCounts(
            state.counts,
            candidate,
          );

        nextStates.push({
          schedule:
            nextSchedule,

          counts:
            nextCounts,

          lastAssignment:
            candidate,
        });
      }
    }

    states =
      pruneStates(
        nextStates,
      );

    if (
      states.length === 0
    ) {
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

  for (
    const day of schedule
  ) {
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
          `${day.month}월 ${day.day}일: ${getWorkerLabel(worker)} → ${getJobLabel(job)} 규칙 위반`,
        );
      }
    }
  }

  return errors;
}


/*
 * 오래된 상세 기록을 baseline으로 압축한다.
 *
 * 예:
 *
 * 현재 기준이 2026-09라면
 *
 * history:
 *   2026-04
 *   2026-05
 *   2026-06
 *   2026-07
 *   2026-08
 *   2026-09
 *
 * 이 범위를 벗어난 월은
 * originalCounts를 baseline으로 합산하고
 * history에서는 삭제한다.
 */
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
    if (
      keep.has(monthKey)
    ) {
      continue;
    }

    if (
      monthData?.originalCounts
    ) {
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

    history:
      nextHistory,
  });

  return true;
}
