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
 * 예전 방식(빔서치) — 안전망 fallback
 *
 * 위의 "목표량 우선 계산" 방식은 대부분의 경우 훨씬 빠르고
 * (수십 초 → 1초 미만) 결과도 더 정교하게 균형을 맞추지만,
 * 누적치가 크게 어긋난 상태(예: 오래 자리를 비웠던 인원이
 * 복귀한 경우 등)에서는 "허용된 조합 중 범위(range)가
 * 최소인 것"만 찾다가 어떤 조합도 못 찾고 실패할 수 있다.
 *
 * 누적치가 크게 어긋난 상태에서는 목표량 계산 자체가
 * 실패할 수 있으므로, 이 안전망을 함께 유지한다.
 *
 * 그래서 "목표량 우선 계산"이 실패하면, 예전에 쓰던
 * 빔서치 방식으로 다시 시도한다. 이 방식은 매일 "허용되는
 * 모든 배정 후보"를 그대로 두고 탐색하기 때문에 느리지만,
 * 완전히 배정이 불가능한 경우가 아니라면 항상 결과를 낸다.
 * ======================================================= */

/*
 * addAssignmentToCounts()는 매번 normalizeWorkerCounts()를 거치며
 * 값 검증(Number 변환, 범위 체크 등)을 다시 수행한다.
 *
 * 이 파일 안의 최적화 탐색 루프에서는 counts가 항상 이미
 * 정규화된 값이라는 것이 보장되므로, 하루에 수만 번씩 불리는
 * 이 계산에서는 검증을 생략한 가벼운 버전을 쓴다.
 * (탐색 루프 밖에서 쓰는 addAssignmentToCounts는 그대로 유지)
 */
function applyAssignmentFast(
  counts,
  assignment,
) {
  const result = {};

  for (const worker of WORKERS) {
    result[worker] =
      { ...counts[worker] };
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


/* =========================================================
 * 김/탁/임 업무별 균형
 * ======================================================= */

/*
 * 각 업무에 대해 김/탁/임의 횟수 차이를 계산한다.
 *
 * 예:
 *
 * 설거지 1 / 1 / 3
 * → range = 2
 *
 * 분쇄   1 / 0 / 4
 * → range = 4
 *
 * 이런 차이를 직접 강하게 줄인다.
 */
function calculateMainJobBalancePenalty(
  counts,
) {
  let penalty = 0;

  for (
    const job of JOBS
  ) {
    const values =
      MAIN_WORKERS.map(
        (worker) =>
          counts[worker][job],
      );

    const range =
      getRange(values);

    penalty +=
      range;
  }

  return penalty;
}


/*
 * 김/탁/임의 업무 분포를 더 세밀하게 평가한다.
 *
 * range만 같아도 분포가 다른 경우가 있어서
 * 편차 제곱합도 보조적으로 사용한다.
 */
function calculateMainJobVariancePenalty(
  counts,
) {
  let penalty = 0;

  for (
    const job of JOBS
  ) {
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

    for (
      const value of values
    ) {
      penalty +=
        Math.pow(
          value - average,
          2,
        );
    }
  }

  return penalty;
}


/*
 * 김/탁/임의 전체 업무량 자체도 균등하게 한다.
 *
 * 각 사람이 맡은 총 업무 횟수의 차이를 평가한다.
 */
function calculateMainTotalBalancePenalty(
  counts,
) {
  const totals =
    MAIN_WORKERS.map(
      (worker) => {
        let total = 0;

        for (
          const job of JOBS
        ) {
          total +=
            counts[worker][job];
        }

        return total;
      },
    );

  return getRange(
    totals,
  );
}


/* =========================================================
 * 연속 업무
 * ======================================================= */

/*
 * 연속 이틀 동일 업무 여부를 스케줄 전체를 매번 처음부터
 * 다시 훑어서 계산하면, 날짜가 늘어날수록 (하루 늘어날 때마다
 * 그 시점까지의 전체 이력을 다시 훑기 때문에) 계산량이
 * 급격히 커진다.
 *
 * 실제로는 "바로 전날과 오늘"만 비교하면 충분하므로,
 * 하루치 증분만 계산해서 상태(state.consecutivePenalty)에
 * 누적시켜 쓴다.
 */
function calculateDayPairConsecutivePenalty(
  previous,
  current,
) {
  if (!previous) {
    return 0;
  }

  let penalty = 0;

  for (
    const job of JOBS
  ) {
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
 * 1차 가지치기 점수
 * ======================================================= */

/*
 * 빔 서치 중간 단계에서 사용하는 점수.
 *
 * 최우선:
 *   1. 볼분리
 *   2. 볼분리 보조
 *
 * 그 다음:
 *   3. 김/탁/임 업무별 균형
 *   4. 류 균형
 *   5. 박 균형
 *   6. 연속 업무
 */
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

  const mainJobBalance =
    calculateMainJobBalancePenalty(
      counts,
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

  const consecutive =
    state.consecutivePenalty;

  return (
    /*
     * 1순위: 볼분리
     */
    bowlRange * 1000000000 +

    /*
     * 2순위: 볼분리 보조
     */
    helperRange * 100000000 +

    /*
     * 3순위: 김/탁/임 업무별 균형
     *
     * 기존보다 훨씬 높은 비중을 준다.
     */
    mainJobBalance * 10000000 +

    /*
     * 4순위: 류
     */
    liuRange * 100000 +

    /*
     * 5순위: 박
     */
    parkRange * 10000 +

    /*
     * 6순위: 연속 동일 업무
     */
    consecutive
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
   * -------------------------------------------------------
   * 1. 볼분리
   * -------------------------------------------------------
   */
  const bowlRange =
    getRange(
      getBowlCounts(
        counts,
      ),
    );


  /*
   * -------------------------------------------------------
   * 2. 볼분리 보조
   * -------------------------------------------------------
   */
  const helperRange =
    getRange(
      getBowlHelperCounts(
        counts,
      ),
    );


  /*
   * -------------------------------------------------------
   * 3. 김/탁/임 업무별 균형
   * -------------------------------------------------------
   */
  const mainJobBalance =
    calculateMainJobBalancePenalty(
      counts,
    );

  const mainJobVariance =
    calculateMainJobVariancePenalty(
      counts,
    );

  const mainTotalBalance =
    calculateMainTotalBalancePenalty(
      counts,
    );


  /*
   * -------------------------------------------------------
   * 4. 류
   * -------------------------------------------------------
   */
  const liuCounts =
    getLiuCounts(
      counts,
    );

  const liuRange =
    getRange(
      liuCounts,
    );

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
   * -------------------------------------------------------
   * 5. 박
   * -------------------------------------------------------
   */
  const parkCounts =
    getParkCounts(
      counts,
    );

  const parkRange =
    getRange(
      parkCounts,
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


  /*
   * -------------------------------------------------------
   * 6. 김/탁/임이 류 가능 업무를 대신 맡는 양
   * -------------------------------------------------------
   */
  const mainExtraValues =
    getMainExtraCounts(
      counts,
    );

  const mainExtraRange =
    getRange(
      mainExtraValues,
    );


  /*
   * -------------------------------------------------------
   * 7. 김/탁/임 각 업무의 전체 spread
   * -------------------------------------------------------
   *
   * 이미 mainJobBalance에서 계산하지만,
   * 각 업무별 차이를 다시 한번 최종 점수에 반영한다.
   */
  let mainJobSpread =
    0;

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


  /*
   * -------------------------------------------------------
   * 8. 전체 연속 동일업무
   * -------------------------------------------------------
   */
  const consecutive =
    state.consecutivePenalty;


  /*
   * -------------------------------------------------------
   * 최종 우선순위
   *
   * 숫자가 클수록 훨씬 큰 우선순위
   *
   * 1. 볼분리
   * 2. 볼분리 보조
   * 3. 김/탁/임 업무별 균형
   * 4. 김/탁/임 업무별 세부 분산
   * 5. 김/탁/임 총업무 균형
   * 6. 류
   * 7. 박
   * 8. 기타
   * -------------------------------------------------------
   */
  return (
    /*
     * 1순위
     */
    bowlRange *
      1000000000000 +

    /*
     * 2순위
     */
    helperRange *
      100000000000 +

    /*
     * 3순위
     *
     * 김/탁/임의 각 업무 차이를
     * 볼분리 다음으로 강하게 최소화
     */
    mainJobBalance *
      10000000000 +

    /*
     * 4순위
     */
    mainJobSpread *
      1000000000 +

    /*
     * 5순위
     */
    mainJobVariance *
      100000000 +

    /*
     * 6순위
     */
    mainTotalBalance *
      10000000 +

    /*
     * 7순위
     */
    mainExtraRange *
      1000000 +

    /*
     * 8순위
     */
    liuRange *
      100000 +

    /*
     * 9순위
     */
    parkRange *
      10000 +

    /*
     * 10순위
     */
    liuVariance *
      1000 +

    /*
     * 11순위
     */
    parkVariance *
      100 +

    /*
     * 12순위
     */
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

  /*
   * 김/탁/임 각 업무별 현재 분포도
   * 상태 시그니처에 포함시킨다.
   *
   * 이렇게 해야 서로 다른 업무 분포를 가진
   * 상태가 같은 상태로 합쳐지는 것을 줄일 수 있다.
   */
  const mainJobs =
    JOBS.map(
      (job) =>
        MAIN_WORKERS.map(
          (worker) =>
            counts[worker][job],
        ).join(","),
    ).join(";");

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
    mainJobs,
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

function optimizeMonthBeamSearchFallback(
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
          applyAssignmentFast(
            state.counts,
            candidate,
          );

        const nextConsecutivePenalty =
          state.consecutivePenalty +
          calculateDayPairConsecutivePenalty(
            state.lastAssignment,
            candidate,
          );

        nextStates.push({
          schedule:
            nextSchedule,

          counts:
            nextCounts,

          lastAssignment:
            candidate,

          consecutivePenalty:
            nextConsecutivePenalty,
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


/* =========================================================
 * 월 전체 최적화
 * ======================================================= */

function optimizeMonthByQuota(
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


/*
 * "목표량 우선 계산"이 대부분의 경우를 훨씬 빠르게 처리하므로
 * 먼저 시도하고, 실패했을 때만 예전 빔서치 방식으로 다시
 * 계산한다. (자세한 이유는 위쪽 fallback 섹션 설명 참고)
 */
let optimizationStats = {
  quotaSuccess: 0,
  fallbackUsed: 0,
  total: 0,
};

export function resetOptimizationStats() {
  optimizationStats = {
    quotaSuccess: 0,
    fallbackUsed: 0,
    total: 0,
  };
}

export function getOptimizationStats() {
  return { ...optimizationStats };
}

export function optimizeMonth(
  year,
  month,
  startDay,
  endDay,
  startingCounts,
) {
  optimizationStats.total += 1;

  try {
    const schedule =
      optimizeMonthByQuota(
        year,
        month,
        startDay,
        endDay,
        startingCounts,
      );

    optimizationStats.quotaSuccess += 1;
    return schedule;
  } catch (error) {
    optimizationStats.fallbackUsed += 1;

    console.warn(
      "목표량 우선 계산 실패, 빔서치 안전망으로 재시도합니다:",
      error,
    );

    return optimizeMonthBeamSearchFallback(
      year,
      month,
      startDay,
      endDay,
      startingCounts,
    );
  }
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
