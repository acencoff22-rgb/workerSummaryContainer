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

    result.push(
      candidate,
    );
  }

  return result;
}


export function calculateOriginalCounts(
  schedule,
) {
  const result =
    normalizeWorkerCounts(
      null,
    );

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

      result[worker][job] += 1;
    }
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
      appData.history[key];

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
      getBowlCounts(counts),
    ) * 1000000 +

    getRange(
      getBowlHelperCounts(counts),
    ) * 100000 +

    getRange(
      getLiuCounts(counts),
    ) * 10000 +

    getRange(
      getMainExtraCounts(counts),
    ) * 1000 +

    getRange(
      getParkCounts(counts),
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
      getBowlCounts(counts),
    );

  const helperRange =
    getRange(
      getBowlHelperCounts(counts),
    );

  const liuCounts =
    getLiuCounts(counts);

  const liuRange =
    getRange(liuCounts);

  const parkCounts =
    getParkCounts(counts);

  const parkRange =
    getRange(parkCounts);

  const mainExtraRange =
    getRange(
      getMainExtraCounts(counts),
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

  for (
    const group of grouped.values()
  ) {
    flattened.push(
      ...group,
    );
  }

  flattened.sort(
    (a, b) =>
      a.score - b.score,
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


export function validateOriginalSchedule(
  schedule,
  getWorkerLabel,
  getJobLabel,
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


export function getStartingCountsForMonth(
  year,
  month,
) {
  return getStartingCounts(
    year,
    month,
  );
}


export function cleanupOldHistory(
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
        RETENTION_MONTHS,
      ),
    );

  let changed = false;

  for (
    const key of keys
  ) {
    if (
      keep.has(key)
    ) {
      continue;
    }

    const monthData =
      appData.history[key];

    if (
      monthData?.originalCounts
    ) {
      const nextBaseline =
        addWorkerCounts(
          appData.baseline,
          monthData.originalCounts,
        );

      appData.baseline =
        nextBaseline;

      changed = true;
    }

    delete appData.history[key];

    changed = true;
  }

  if (changed) {
    setAppData({
      ...appData,
    });
  }
}
