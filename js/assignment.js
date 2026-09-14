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
    const worker = assignment[job];

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
 * 하루 후보
 * ======================================================= */

/*
 * 제한 업무의 구조를 4가지 패턴으로 분류한다.
 *
 * 패턴 번호
 * ---------------------------------------------------------
 * 0 = 박→분쇄, 류→성형
 * 1 = 박→설거지, 류→성형
 * 2 = 박→설거지, 류→분쇄
 * 3 = 박→분쇄, 류→설거지
 *
 * 각 패턴에는 김/탁/임의 남은 업무 배치가
 * 6가지씩 존재한다.
 *
 * 먼저 이 4개 패턴의 월간 사용 횟수를 최적화해서
 * 박/류의 업무 균형을 정확히 맞춘 뒤,
 * 각 패턴 안에서 김/탁/임 배치를 최적화한다.
 */
function getCandidatePattern(
  candidate,
) {
  const parkJob =
    candidate["설거지 및 성형보조"] === "박"
      ? "설거지"
      : candidate["분쇄 및 성형보조"] === "박"
        ? "분쇄"
        : null;

  const liuJob =
    candidate["설거지 및 성형보조"] === "류"
      ? "설거지"
      : candidate["분쇄 및 성형보조"] === "류"
        ? "분쇄"
        : candidate["성형 및 분쇄보조"] === "류"
          ? "성형"
          : null;

  if (
    parkJob === "분쇄" &&
    liuJob === "성형"
  ) {
    return 0;
  }

  if (
    parkJob === "설거지" &&
    liuJob === "성형"
  ) {
    return 1;
  }

  if (
    parkJob === "설거지" &&
    liuJob === "분쇄"
  ) {
    return 2;
  }

  if (
    parkJob === "분쇄" &&
    liuJob === "설거지"
  ) {
    return 3;
  }

  return -1;
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

    const pattern =
      getCandidatePattern(
        candidate,
      );

    if (pattern < 0) {
      continue;
    }

    result.push({
      assignment:
        candidate,

      pattern,
    });
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
    )) {
    if (
      monthKey === targetMonth
    ) {
      continue;
    }

    if (
      !rollingKeys.has(
        monthKey,
      )
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
 * 박/류의 월간 패턴 최적화
 * ======================================================= */

/*
 * 패턴별 증가량
 *
 * pattern 0
 *   박 분쇄 +1
 *   류 성형 +1
 *
 * pattern 1
 *   박 설거지 +1
 *   류 성형 +1
 *
 * pattern 2
 *   박 설거지 +1
 *   류 분쇄 +1
 *
 * pattern 3
 *   박 분쇄 +1
 *   류 설거지 +1
 */
const PATTERN_EFFECTS = [
  {
    park: "분쇄",
    liu: "성형",
  },
  {
    park: "설거지",
    liu: "성형",
  },
  {
    park: "설거지",
    liu: "분쇄",
  },
  {
    park: "분쇄",
    liu: "설거지",
  },
];


function calculatePatternResult(
  startingCounts,
  patternCounts,
) {
  const park = {
    설거지:
      startingCounts["박"][
        "설거지 및 성형보조"
      ],

    분쇄:
      startingCounts["박"][
        "분쇄 및 성형보조"
      ],
  };

  const liu = {
    설거지:
      startingCounts["류"][
        "설거지 및 성형보조"
      ],

    분쇄:
      startingCounts["류"][
        "분쇄 및 성형보조"
      ],

    성형:
      startingCounts["류"][
        "성형 및 분쇄보조"
      ],
  };

  for (
    let pattern = 0;
    pattern < PATTERN_EFFECTS.length;
    pattern += 1
  ) {
    const count =
      patternCounts[pattern] || 0;

    if (count === 0) {
      continue;
    }

    const effect =
      PATTERN_EFFECTS[pattern];

    park[effect.park] +=
      count;

    liu[effect.liu] +=
      count;
  }

  const parkValues =
    Object.values(park);

  const liuValues =
    Object.values(liu);

  const parkRange =
    getRange(parkValues);

  const liuRange =
    getRange(liuValues);

  const parkAverage =
    parkValues.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) /
    parkValues.length;

  const liuAverage =
    liuValues.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) /
    liuValues.length;

  const parkVariance =
    parkValues.reduce(
      (sum, value) =>
        sum +
        Math.pow(
          value - parkAverage,
          2,
        ),
      0,
    );

  const liuVariance =
    liuValues.reduce(
      (sum, value) =>
        sum +
        Math.pow(
          value - liuAverage,
          2,
        ),
      0,
    );

  return {
    park,
    liu,
    parkRange,
    liuRange,
    parkVariance,
    liuVariance,
  };
}


function comparePatternResults(
  a,
  b,
) {
  if (
    a.parkRange !==
    b.parkRange
  ) {
    return (
      a.parkRange -
      b.parkRange
    );
  }

  if (
    a.liuRange !==
    b.liuRange
  ) {
    return (
      a.liuRange -
      b.liuRange
    );
  }

  if (
    a.parkVariance !==
    b.parkVariance
  ) {
    return (
      a.parkVariance -
      b.parkVariance
    );
  }

  return (
    a.liuVariance -
    b.liuVariance
  );
}


function findBestPatternQuotas(
  startingCounts,
  totalDays,
) {
  let best = null;

  /*
   * 4개 패턴의 총합이 totalDays가 되도록
   * 가능한 정수 조합을 모두 검사한다.
   * 31일 기준으로도 수만 개 수준이라 충분히 가볍다.
   */
  for (
    let p0 = 0;
    p0 <= totalDays;
    p0 += 1
  ) {
    for (
      let p1 = 0;
      p1 <= totalDays - p0;
      p1 += 1
    ) {
      for (
        let p2 = 0;
        p2 <= totalDays - p0 - p1;
        p2 += 1
      ) {
        const p3 =
          totalDays -
          p0 -
          p1 -
          p2;

        const patternCounts = [
          p0,
          p1,
          p2,
          p3,
        ];

        const result =
          calculatePatternResult(
            startingCounts,
            patternCounts,
          );

        if (
          !best ||
          comparePatternResults(
            result,
            best.result,
          ) < 0
        ) {
          best = {
            patternCounts,
            result,
          };
        }
      }
    }
  }

  if (!best) {
    throw new Error(
      "월간 박/류 업무 균형을 위한 패턴을 계산하지 못했습니다.",
    );
  }

  return best;
}


/* =========================================================
 * 김 / 탁 / 임 업무 균형
 * ======================================================= */

function getMainJobBalancePenalty(
  counts,
) {
  let penalty = 0;

  for (
    const job of JOBS
  ) {
    penalty +=
      getRange(
        MAIN_WORKERS.map(
          (worker) =>
            counts[worker][job],
        ),
      );
  }

  return penalty;
}


function getMainJobVariancePenalty(
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


function getMainExtraRange(
  counts,
) {
  return getRange(
    getMainExtraCounts(
      counts,
    ),
  );
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

  for (
    const job of JOBS
  ) {
    if (
      previous[job] &&
      previous[job] ===
        current[job]
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
) {
  const counts =
    state.counts;

  const mainJobBalance =
    getMainJobBalancePenalty(
      counts,
    );

  const mainJobVariance =
    getMainJobVariancePenalty(
      counts,
    );

  const mainExtraRange =
    getMainExtraRange(
      counts,
    );

  return (
    mainJobBalance *
      1000000 +

    mainJobVariance *
      10000 +

    mainExtraRange *
      100 +

    state.consecutivePenalty
  );
}


function calculateFinalScore(
  state,
) {
  const counts =
    state.counts;

  const mainJobBalance =
    getMainJobBalancePenalty(
      counts,
    );

  const mainJobVariance =
    getMainJobVariancePenalty(
      counts,
    );

  const mainExtraRange =
    getMainExtraRange(
      counts,
    );

  return (
    mainJobBalance *
      1000000000 +

    mainJobVariance *
      1000000 +

    mainExtraRange *
      10000 +

    state.consecutivePenalty
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

  const mainJobs =
    JOBS.map(
      (job) =>
        MAIN_WORKERS.map(
          (worker) =>
            counts[worker][job],
        ).join(","),
    ).join(";");

  const patterns =
    state.patternCounts.join(",");

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
    patterns,
    mainJobs,
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

  const totalDays =
    dates.length;

  const patternPlan =
    findBestPatternQuotas(
      normalizeWorkerCounts(
        startingCounts,
      ),
      totalDays,
    );

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

      patternCounts: [
        0,
        0,
        0,
        0,
      ],
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
        const pattern =
          candidate.pattern;

        const used =
          state.patternCounts[
            pattern
          ];

        const quota =
          patternPlan.patternCounts[
            pattern
          ];

        /*
         * 목표보다 해당 패턴을 많이 사용할 수 없다.
         */
        if (
          used >= quota
        ) {
          continue;
        }

        const nextPatternCounts =
          state.patternCounts.slice();

        nextPatternCounts[
          pattern
        ] += 1;

        const nextSchedule = [
          ...state.schedule,

          {
            ...dates[index],
            ...candidate.assignment,
          },
        ];

        const nextCounts =
          applyAssignmentFast(
            state.counts,
            candidate.assignment,
          );

        const pairPenalty =
          calculateDayPairConsecutivePenalty(
            state.lastAssignment,
            candidate.assignment,
          );

        nextStates.push({
          schedule:
            nextSchedule,

          counts:
            nextCounts,

          lastAssignment:
            candidate.assignment,

          consecutivePenalty:
            state.consecutivePenalty +
            pairPenalty,

          patternCounts:
            nextPatternCounts,
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

  /*
   * 여기까지 온 모든 state는
   * 전체 날짜 수와 quota의 합이 같고,
   * 각 패턴 quota를 초과하지 않았으므로
   * 최종적으로 quota를 모두 충족한다.
   */
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
      ).size !==
      WORKERS.length
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
