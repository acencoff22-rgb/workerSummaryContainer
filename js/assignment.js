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


/* =========================================================
 * 업무 제한
 * ======================================================= */

export function isAllowed(
  worker,
  job,
) {
  /*
   * 볼분리 / 볼분리 보조는
   * 김 / 탁 / 임만 가능
   */
  if (
    job === "볼분리" ||
    job === "볼분리 보조"
  ) {
    return MAIN_WORKERS.includes(
      worker,
    );
  }

  /*
   * 박은 설거지 / 분쇄 계열만 가능
   */
  if (
    worker === "박"
  ) {
    return PARK_ALLOWED_JOBS.includes(
      job,
    );
  }

  /*
   * 류는 설거지 / 분쇄 / 성형 계열만 가능
   */
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
 * 작업자별 업무
 * ======================================================= */

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


/* =========================================================
 * 누적 시작값
 * ======================================================= */

export function getStartingCountsForMonth(
  year,
  month,
) {
  /*
   * baseline에는 이미 보관기간 밖의
   * 과거 기록이 압축되어 있다.
   */
  let counts =
    normalizeWorkerCounts(
      appData.baseline,
    );

  const targetMonth =
    getMonthKey(
      year,
      month,
    );

  /*
   * 현재 생성 월을 기준으로
   * 보관 중인 최근 6개월 범위만 사용한다.
   */
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
    /*
     * 현재 생성 대상 월은 기존 기록을
     * 누적 계산에서 제외한다.
     */
    if (
      monthKey === targetMonth
    ) {
      continue;
    }

    /*
     * 혹시 history에 오래된 데이터가 남아 있더라도
     * baseline과 중복 계산하지 않는다.
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


/* =========================================================
 * 기본 균형값
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

function calculateFullConsecutivePenalty(
  schedule,
) {
  if (
    !Array.isArray(schedule) ||
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
    calculateFullConsecutivePenalty(
      state.schedule,
    );

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
    calculateFullConsecutivePenalty(
      state.schedule,
    );


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


/* =========================================================
 * 배정표 검증
 * ======================================================= */

export function validateOriginalSchedule(
  schedule,
  getWorkerLabel = (worker) =>
    worker,
  getJobLabel = (job) =>
    job,
) {
  const errors = [];

  if (
    !Array.isArray(schedule)
  ) {
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

    /*
     * 모든 업무에 작업자가 있는지
     */
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

    /*
     * 하루에 작업자가 중복되지 않는지
     */
    if (
      new Set(
        assignedWorkers,
      ).size !==
      WORKERS.length
    ) {
      errors.push(
        `${day.month}월 ${day.day}일: 작업자 중복`,
      );
    }

    /*
     * 업무 제한 규칙
     */
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


/* =========================================================
 * 오래된 기록 정리
 * ======================================================= */

/*
 * 보관기간을 벗어난 history는 baseline으로 압축한다.
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
    ] of Object.entries(
      history,
    )
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
