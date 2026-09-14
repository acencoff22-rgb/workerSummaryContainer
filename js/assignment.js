"use strict";

import {
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
    return MAIN_WORKERS.includes(worker);
  }

  if (worker === "박") {
    return PARK_ALLOWED_JOBS.includes(job);
  }

  if (worker === "류") {
    return LIU_JOBS.includes(job);
  }

  return true;
}


/* =========================================================
 * 하루 후보
 * ======================================================= */

export function createDailyCandidates() {
  const result = [];

  const permutations =
    generatePermutations(WORKERS);

  for (const workerOrder of permutations) {
    const candidate = {};
    let valid = true;

    for (
      let index = 0;
      index < JOBS.length;
      index += 1
    ) {
      const job = JOBS[index];
      const worker = workerOrder[index];

      if (!isAllowed(worker, job)) {
        valid = false;
        break;
      }

      candidate[job] = worker;
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
 * 분포 생성
 * ======================================================= */

function enumerateCompositions(
  workerCount,
  total,
) {
  const result = [];
  const values =
    Array(workerCount).fill(0);

  function visit(index, remaining) {
    if (index === workerCount - 1) {
      values[index] = remaining;
      result.push([...values]);
      return;
    }

    for (
      let value = 0;
      value <= remaining;
      value += 1
    ) {
      values[index] = value;
      visit(
        index + 1,
        remaining - value,
      );
    }
  }

  visit(0, total);

  return result;
}


function calculateFinalDistributionScore(
  startingValues,
  additions,
) {
  const finals = startingValues.map(
    (value, index) =>
      value + additions[index],
  );

  const range =
    getRange(finals);

  const average =
    finals.reduce(
      (sum, value) => sum + value,
      0,
    ) / finals.length;

  const variance =
    finals.reduce(
      (sum, value) =>
        sum +
        Math.pow(
          value - average,
          2,
        ),
      0,
    );

  return {
    finals,
    range,
    variance,
  };
}


function getBestBalancedDistributions(
  startingValues,
  total,
) {
  const compositions =
    enumerateCompositions(
      startingValues.length,
      total,
    );

  const scored =
    compositions.map(
      (additions) => ({
        additions,
        ...calculateFinalDistributionScore(
          startingValues,
          additions,
        ),
      }),
    );

  scored.sort(
    (a, b) =>
      compareNumbers(
        [
          a.range,
          a.variance,
          ...a.finals,
        ],
        [
          b.range,
          b.variance,
          ...b.finals,
        ],
      ),
  );

  const bestRange =
    scored[0]?.range ?? Infinity;

  return scored.filter(
    (item) =>
      item.range === bestRange,
  );
}


function compareNumbers(
  a,
  b,
) {
  const length =
    Math.max(
      a.length,
      b.length,
    );

  for (
    let index = 0;
    index < length;
    index += 1
  ) {
    const av =
      Number(a[index] ?? 0);

    const bv =
      Number(b[index] ?? 0);

    if (av < bv) {
      return -1;
    }

    if (av > bv) {
      return 1;
    }
  }

  return 0;
}


/* =========================================================
 * 볼분리 / 볼분리 보조 목표
 * ======================================================= */

function chooseBowlAndHelperTargetOptions(
  startingCounts,
  days,
) {
  const bowlStart =
    MAIN_WORKERS.map(
      (worker) =>
        startingCounts[worker]["볼분리"],
    );

  const helperStart =
    MAIN_WORKERS.map(
      (worker) =>
        startingCounts[worker]["볼분리 보조"],
    );

  const bowlOptions =
    getBestBalancedDistributions(
      bowlStart,
      days,
    );

  const helperOptions =
    getBestBalancedDistributions(
      helperStart,
      days,
    );

  const options = [];

  for (const bowl of bowlOptions) {
    for (const helper of helperOptions) {
      const lowerCapacity =
        MAIN_WORKERS.map(
          (_, index) =>
            days -
            bowl.additions[index] -
            helper.additions[index],
        );

      if (
        lowerCapacity.some(
          (value) =>
            value < 0,
        )
      ) {
        continue;
      }

      options.push({
        bowl,
        helper,
        lowerCapacity,
      });
    }
  }

  return options;
}


/* =========================================================
 * 박 / 류 목표
 * ======================================================= */

function getParkOptions(
  startingCounts,
  days,
) {
  const start =
    PARK_ALLOWED_JOBS.map(
      (job) =>
        startingCounts["박"][job],
    );

  return getBestBalancedDistributions(
    start,
    days,
  );
}


function getLiuOptions(
  startingCounts,
  days,
) {
  const start =
    LIU_JOBS.map(
      (job) =>
        startingCounts["류"][job],
    );

  return getBestBalancedDistributions(
    start,
    days,
  );
}


/* =========================================================
 * 김 / 탁 / 임 하위 3업무 최적화
 * ======================================================= */

function buildMainLowerMatrix(
  startingCounts,
  lowerCapacity,
  lowerColumnTotals,
) {
  const rowCompositions =
    lowerCapacity.map(
      (capacity) =>
        enumerateCompositions(
          3,
          capacity,
        ),
    );

  const startLower =
    MAIN_WORKERS.map(
      (worker) =>
        JOBS.slice(2).map(
          (job) =>
            startingCounts[worker][job],
        ),
    );

  let best = null;

  for (
    const row0 of rowCompositions[0]
  ) {
    for (
      const row1 of rowCompositions[1]
    ) {
      const row2 =
        lowerColumnTotals.map(
          (total, jobIndex) =>
            total -
            row0[jobIndex] -
            row1[jobIndex],
        );

      if (
        row2.some(
          (value) =>
            value < 0,
        )
      ) {
        continue;
      }

      if (
        row2.reduce(
          (sum, value) =>
            sum + value,
          0,
        ) !==
        lowerCapacity[2]
      ) {
        continue;
      }

      const rows = [
        row0,
        row1,
        row2,
      ];

      const jobRanges = [];
      const jobVariances = [];
      const jobTotals = [];

      for (
        let jobIndex = 0;
        jobIndex < 3;
        jobIndex += 1
      ) {
        const finals =
          MAIN_WORKERS.map(
            (worker, workerIndex) =>
              startLower[workerIndex][jobIndex] +
              rows[workerIndex][jobIndex],
          );

        const average =
          finals.reduce(
            (sum, value) =>
              sum + value,
            0,
          ) /
          finals.length;

        jobRanges.push(
          getRange(finals),
        );

        jobVariances.push(
          finals.reduce(
            (sum, value) =>
              sum +
              Math.pow(
                value - average,
                2,
              ),
            0,
          ),
        );

        jobTotals.push(
          finals.join(","),
        );
      }

      const score = [
        Math.max(...jobRanges),
        ...jobRanges,
        ...jobVariances,
        ...jobTotals,
        ...rows.flat(),
      ];

      if (
        !best ||
        compareNumbers(
          score,
          best.score,
        ) < 0
      ) {
        best = {
          matrix: rows,
          score,
        };
      }
    }
  }

  if (!best) {
    throw new Error(
      "김·탁·임의 하위 업무 목표량을 계산하지 못했습니다.",
    );
  }

  return best.matrix;
}


/* =========================================================
 * 전체 월간 목표량
 * ======================================================= */

function buildQuotaMatrix(
  startingCounts,
  days,
) {
  const bowlHelperOptions =
    chooseBowlAndHelperTargetOptions(
      startingCounts,
      days,
    );

  if (bowlHelperOptions.length === 0) {
    throw new Error(
      "볼분리/볼분리 보조 목표량을 계산하지 못했습니다.",
    );
  }

  const parkOptions =
    getParkOptions(
      startingCounts,
      days,
    );

  const liuOptions =
    getLiuOptions(
      startingCounts,
      days,
    );

  let best = null;

  for (const bowlHelper of bowlHelperOptions) {
    for (const park of parkOptions) {
      for (const liu of liuOptions) {
        const lowerColumnTotals = [
          days - park.additions[0] - liu.additions[0],
          days - park.additions[1] - liu.additions[1],
          days - liu.additions[2],
        ];

        const lowerTotal =
          lowerColumnTotals.reduce(
            (sum, value) =>
              sum + value,
            0,
          );

        const mainLowerTotal =
          bowlHelper.lowerCapacity.reduce(
            (sum, value) =>
              sum + value,
            0,
          );

        if (
          lowerTotal !== mainLowerTotal
        ) {
          continue;
        }

        if (
          lowerColumnTotals.some(
            (value) =>
              value < 0,
          )
        ) {
          continue;
        }

        let mainMatrix;

        try {
          mainMatrix =
            buildMainLowerMatrix(
              startingCounts,
              bowlHelper.lowerCapacity,
              lowerColumnTotals,
            );
        } catch (error) {
          continue;
        }

        const mainJobRanges = [];
        const mainJobVariances = [];
        const mainJobFinals = [];

        for (
          let jobIndex = 0;
          jobIndex < 3;
          jobIndex += 1
        ) {
          const finals =
            MAIN_WORKERS.map(
              (worker, workerIndex) =>
                startingCounts[worker][JOBS[jobIndex + 2]] +
                mainMatrix[workerIndex][jobIndex],
            );

          const average =
            finals.reduce(
              (sum, value) =>
                sum + value,
              0,
            ) / finals.length;

          mainJobFinals.push(
            ...finals,
          );

          mainJobRanges.push(
            getRange(finals),
          );

          mainJobVariances.push(
            finals.reduce(
              (sum, value) =>
                sum +
                Math.pow(
                  value - average,
                  2,
                ),
              0,
            ),
          );
        }

        const score = [
          /* 1순위: 김/탁/임 업무별 최대 편차 */
          Math.max(...mainJobRanges),

          /* 2순위: 김/탁/임 업무별 총 편차 */
          mainJobRanges.reduce(
            (sum, value) =>
              sum + value,
            0,
          ),

          /* 3순위: 업무별 편차 */
          ...mainJobRanges,

          /* 4순위: 세부 분산 */
          ...mainJobVariances,

          /* 5순위: 박 */
          park.range,

          /* 6순위: 류 */
          liu.range,

          /* 7순위: 김/탁/임 lower 총량 편차 */
          getRange(
            bowlHelper.lowerCapacity,
          ),

          /* 8순위: 결과값의 세부 순서 */
          ...mainJobFinals,
          ...park.finals,
          ...liu.finals,
          ...bowlHelper.bowl.finals,
          ...bowlHelper.helper.finals,
        ];

        if (
          !best ||
          compareNumbers(
            score,
            best.score,
          ) < 0
        ) {
          best = {
            bowl:
              bowlHelper.bowl,
            helper:
              bowlHelper.helper,
            main:
              mainMatrix,
            park,
            liu,
            score,
          };
        }
      }
    }
  }

  if (!best) {
    throw new Error(
      "전체 업무 목표량을 만족하는 조합을 찾지 못했습니다.",
    );
  }

  const matrix =
    WORKERS.map(
      () =>
        JOBS.map(() => 0),
    );

  for (
    let index = 0;
    index < MAIN_WORKERS.length;
    index += 1
  ) {
    const workerIndex =
      WORKERS.indexOf(
        MAIN_WORKERS[index],
      );

    matrix[workerIndex][0] =
      best.bowl.additions[index];

    matrix[workerIndex][1] =
      best.helper.additions[index];

    for (
      let jobIndex = 0;
      jobIndex < 3;
      jobIndex += 1
    ) {
      matrix[workerIndex][jobIndex + 2] =
        best.main[index][jobIndex];
    }
  }

  const parkIndex =
    WORKERS.indexOf("박");

  matrix[parkIndex][2] =
    best.park.additions[0];

  matrix[parkIndex][3] =
    best.park.additions[1];

  matrix[parkIndex][4] = 0;

  const liuIndex =
    WORKERS.indexOf("류");

  matrix[liuIndex][2] =
    best.liu.additions[0];

  matrix[liuIndex][3] =
    best.liu.additions[1];

  matrix[liuIndex][4] =
    best.liu.additions[2];

  validateQuotaMatrix(
    matrix,
    days,
  );

  return matrix;
}


/* =========================================================
 * 목표량 검증
 * ======================================================= */

function validateQuotaMatrix(
  matrix,
  days,
) {
  if (
    !Array.isArray(matrix) ||
    matrix.length !== WORKERS.length
  ) {
    throw new Error(
      "목표량 행렬 형식이 올바르지 않습니다.",
    );
  }

  for (
    let workerIndex = 0;
    workerIndex < WORKERS.length;
    workerIndex += 1
  ) {
    const row = matrix[workerIndex];

    if (
      !Array.isArray(row) ||
      row.length !== JOBS.length
    ) {
      throw new Error(
        `${WORKERS[workerIndex]} 목표량 형식이 올바르지 않습니다.`,
      );
    }

    const total =
      row.reduce(
        (sum, value) =>
          sum + value,
        0,
      );

    if (total !== days) {
      throw new Error(
        `${WORKERS[workerIndex]} 목표 업무량이 ${days}회가 아닙니다. 실제 ${total}회`,
      );
    }

    for (
      let jobIndex = 0;
      jobIndex < JOBS.length;
      jobIndex += 1
    ) {
      if (
        !Number.isInteger(
          row[jobIndex],
        ) ||
        row[jobIndex] < 0
      ) {
        throw new Error(
          `${WORKERS[workerIndex]}의 ${JOBS[jobIndex]} 목표량이 잘못되었습니다.`,
        );
      }

      if (
        row[jobIndex] > 0 &&
        !isAllowed(
          WORKERS[workerIndex],
          JOBS[jobIndex],
        )
      ) {
        throw new Error(
          `${WORKERS[workerIndex]} → ${JOBS[jobIndex]} 목표량에 허용되지 않은 업무가 포함되어 있습니다.`,
        );
      }
    }
  }

  for (
    let jobIndex = 0;
    jobIndex < JOBS.length;
    jobIndex += 1
  ) {
    const total =
      matrix.reduce(
        (sum, row) =>
          sum + row[jobIndex],
        0,
      );

    if (total !== days) {
      throw new Error(
        `${JOBS[jobIndex]} 목표량이 ${days}회가 아닙니다. 실제 ${total}회`,
      );
    }
  }
}


/* =========================================================
 * 일일 매칭
 * ======================================================= */

function findPerfectMatchings(
  remaining,
) {
  const result = [];

  function visit(
    jobIndex,
    usedWorkers,
    assignment,
  ) {
    if (
      jobIndex === JOBS.length
    ) {
      result.push([
        ...assignment,
      ]);
      return;
    }

    for (
      let workerIndex = 0;
      workerIndex < WORKERS.length;
      workerIndex += 1
    ) {
      if (
        usedWorkers.has(workerIndex)
      ) {
        continue;
      }

      if (
        remaining[workerIndex][jobIndex] <= 0
      ) {
        continue;
      }

      usedWorkers.add(
        workerIndex,
      );

      assignment.push(
        workerIndex,
      );

      visit(
        jobIndex + 1,
        usedWorkers,
        assignment,
      );

      assignment.pop();
      usedWorkers.delete(
        workerIndex,
      );
    }
  }

  visit(
    0,
    new Set(),
    [],
  );

  return result;
}


function calculateDailyConsecutivePenalty(
  previous,
  candidate,
) {
  if (!previous) {
    return 0;
  }

  let penalty = 0;

  for (
    let jobIndex = 0;
    jobIndex < JOBS.length;
    jobIndex += 1
  ) {
    const job =
      JOBS[jobIndex];

    const worker =
      WORKERS[candidate[jobIndex]];

    if (
      previous[job] === worker
    ) {
      penalty += 1;
    }
  }

  return penalty;
}


function chooseNextDailyMatching(
  remaining,
  previous,
) {
  const candidates =
    findPerfectMatchings(
      remaining,
    );

  if (
    candidates.length === 0
  ) {
    throw new Error(
      "남은 목표량을 만족하는 일일 배정을 찾지 못했습니다.",
    );
  }

  let best = null;

  for (
    const candidate of candidates
  ) {
    const consecutive =
      calculateDailyConsecutivePenalty(
        previous,
        candidate,
      );

    const key =
      candidate.join(",");

    const score = [
      consecutive,
      key,
    ];

    if (
      !best ||
      compareNumbers(
        score.slice(0, 1),
        best.score.slice(0, 1),
      ) < 0
    ) {
      best = {
        candidate,
        score,
      };
    }
  }

  return best.candidate;
}


/* =========================================================
 * 목표량 → 일별 배정표
 * ======================================================= */

function decomposeQuotaMatrix(
  quotaMatrix,
  days,
) {
  const remaining =
    quotaMatrix.map(
      (row) => [...row],
    );

  const schedules = [];
  let previous = null;

  for (
    let dayIndex = 0;
    dayIndex < days;
    dayIndex += 1
  ) {
    const matching =
      chooseNextDailyMatching(
        remaining,
        previous,
      );

    const assignment = {};

    for (
      let jobIndex = 0;
      jobIndex < JOBS.length;
      jobIndex += 1
    ) {
      const workerIndex =
        matching[jobIndex];

      const worker =
        WORKERS[workerIndex];

      const job =
        JOBS[jobIndex];

      assignment[job] =
        worker;

      remaining[workerIndex][jobIndex] -= 1;
    }

    schedules.push(
      assignment,
    );

    previous = matching;
  }

  for (
    let workerIndex = 0;
    workerIndex < WORKERS.length;
    workerIndex += 1
  ) {
    if (
      remaining[workerIndex].some(
        (value) => value !== 0,
      )
    ) {
      throw new Error(
        `${WORKERS[workerIndex]}의 목표 업무량을 모두 소진하지 못했습니다.`,
      );
    }
  }

  return schedules;
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

  const days =
    dates.length;

  if (days <= 0) {
    throw new Error(
      "배정할 날짜가 없습니다.",
    );
  }

  const quotaMatrix =
    buildQuotaMatrix(
      normalizeWorkerCounts(
        startingCounts,
      ),
      days,
    );

  const dailyAssignments =
    decomposeQuotaMatrix(
      quotaMatrix,
      days,
    );

  const schedule =
    dailyAssignments.map(
      (assignment, index) => ({
        ...dates[index],
        ...assignment,
      }),
    );

  const errors =
    validateOriginalSchedule(
      schedule,
    );

  if (errors.length > 0) {
    throw new Error(
      `자동 배정 검증 실패: ${errors.join(" / ")}`,
    );
  }

  return schedule;
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
        (worker) => !worker,
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

      if (!isAllowed(worker, job)) {
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

    if (
      monthData?.originalCounts
    ) {
      baseline =
        addWorkerCounts(
          baseline,
          monthData.originalCounts,
        );
    }

    delete nextHistory[
      monthKey
    ];

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
