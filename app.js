"use strict";

/*
 * =========================================================
 * 업무 배정표 자동 생성기
 * =========================================================
 *
 * 월 전체 최적화 버전
 *
 * 핵심 규칙
 * ---------------------------------------------------------
 * 1. 하루 5개 업무는 각각 정확히 1번씩 배정
 * 2. 한 작업자는 하루에 정확히 1개 업무만 담당
 *
 * 3. 볼분리
 *    -> 김 / 탁 / 임
 *
 * 4. 볼분리 보조
 *    -> 김 / 탁 / 임
 *
 * 5. 류
 *    -> 설거지 및 성형보조
 *    -> 분쇄 및 성형보조
 *    -> 성형 및 분쇄보조
 *    세 업무 모두 가능
 *
 * 6. 박
 *    -> 설거지 및 성형보조
 *    -> 분쇄 및 성형보조
 *    두 업무만 가능
 *
 * 7. 박에게 성형 및 분쇄보조를 직접 배정하지 않는다.
 *    기존 교환 규칙 적용 후의 최종 결과와 동일한
 *    형태를 사용한다.
 *
 * =========================================================
 *
 * 월 전체 최적화 우선순위
 * ---------------------------------------------------------
 * 1순위  김·탁·임 볼분리 균등
 * 2순위  김·탁·임 볼분리 보조 균등
 * 3순위  류 3개 업무 균등
 * 4순위  김·탁·임 나머지 업무 편중 최소화
 * 5순위  박 2개 업무 균등
 * 6순위  작업자의 같은 업무 연속 최소화
 *
 * =========================================================
 */

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

const BOWL_WORKERS = [
  "김",
  "탁",
  "임",
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
 * 빔 탐색 폭
 *
 * 브라우저에서 너무 느려지지 않으면서
 * 월 전체 후보를 충분히 유지한다.
 */
const BEAM_WIDTH = 2500;

/*
 * 같은 점수의 후보를 지나치게 많이 유지하지 않기 위한 제한
 */
const MAX_STATES_PER_SIGNATURE = 3;

let currentSchedule = [];
let copiedText = "";


/* =========================================================
 * 기본 유틸리티
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

function cloneWorkerCounts(counts) {
  const result = createEmptyWorkerCounts();

  for (const worker of WORKERS) {
    for (const job of JOBS) {
      result[worker][job] =
        counts[worker][job];
    }
  }

  return result;
}

function shuffle(array) {
  const result = [...array];

  for (
    let i = result.length - 1;
    i > 0;
    i -= 1
  ) {
    const randomIndex =
      Math.floor(
        Math.random() * (i + 1),
      );

    [
      result[i],
      result[randomIndex],
    ] = [
      result[randomIndex],
      result[i],
    ];
  }

  return result;
}

function getWeekdayName(weekday) {
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

function getDateInfo(
  year,
  month,
  day,
) {
  const date = new Date(
    year,
    month - 1,
    day,
  );

  return {
    year: date.getFullYear(),
    month:
      date.getMonth() + 1,
    day: date.getDate(),
    weekday: date.getDay(),
  };
}

function arrayRange(
  start,
  end,
) {
  const result = [];

  for (
    let value = start;
    value <= end;
    value += 1
  ) {
    result.push(value);
  }

  return result;
}


/* =========================================================
 * 업무 가능 여부
 * ======================================================= */

function isAllowed(
  worker,
  job,
) {
  /*
   * 볼분리 계열은 김/탁/임만
   */
  if (
    job === "볼분리" ||
    job === "볼분리 보조"
  ) {
    return BOWL_WORKERS.includes(
      worker,
    );
  }

  /*
   * 박은 두 업무만 가능
   */
  if (worker === "박") {
    return PARK_ALLOWED_JOBS.includes(
      job,
    );
  }

  /*
   * 류는 나머지 세 업무 가능
   */
  if (worker === "류") {
    return LIU_JOBS.includes(
      job,
    );
  }

  /*
   * 김/탁/임은 나머지 업무 가능
   */
  return true;
}


/* =========================================================
 * 순열 생성
 * ======================================================= */

function generatePermutations(
  items,
) {
  if (items.length <= 1) {
    return [items.slice()];
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

    const permutations =
      generatePermutations(
        remaining,
      );

    for (
      const permutation of permutations
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
 * 하루 가능한 모든 배정 후보 생성
 *
 * 5명 × 5업무의 1:1 순열을 만든 뒤
 * 업무 가능 규칙에 맞지 않는 것은 제거한다.
 *
 * 전체 순열은 5! = 120개뿐이므로
 * 브라우저에서 충분히 빠르다.
 * ======================================================= */

function generateDailyCandidates() {
  const candidates = [];

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

    /*
     * 작업자 중복 여부
     */
    const usedWorkers =
      JOBS.map(
        (job) =>
          candidate[job],
      );

    if (
      new Set(
        usedWorkers,
      ).size !== WORKERS.length
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
 * 초기 상태
 * ======================================================= */

function createInitialState() {
  return {
    schedule: [],
    workerCounts:
      createEmptyWorkerCounts(),
    jobCounts:
      createEmptyJobCounts(),
    lastAssignment: null,
  };
}


/* =========================================================
 * 상태에 하루 배정을 추가
 * ======================================================= */

function addCandidateToState(
  state,
  candidate,
  dateInfo,
) {
  const workerCounts =
    cloneWorkerCounts(
      state.workerCounts,
    );

  const jobCounts = {
    ...state.jobCounts,
  };

  for (
    const job of JOBS
  ) {
    const worker =
      candidate[job];

    workerCounts[worker][job] += 1;
    jobCounts[job] += 1;
  }

  const day = {
    ...dateInfo,
    ...candidate,
  };

  return {
    schedule: [
      ...state.schedule,
      day,
    ],
    workerCounts,
    jobCounts,
    lastAssignment:
      candidate,
  };
}


/* =========================================================
 * 범위 계산
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
 * 김·탁·임 볼분리 횟수
 * ======================================================= */

function getBowlCounts(
  workerCounts,
) {
  return MAIN_WORKERS.map(
    (worker) =>
      workerCounts[worker][
        "볼분리"
      ],
  );
}


/* =========================================================
 * 김·탁·임 볼분리 보조 횟수
 * ======================================================= */

function getBowlHelperCounts(
  workerCounts,
) {
  return MAIN_WORKERS.map(
    (worker) =>
      workerCounts[worker][
        "볼분리 보조"
      ],
  );
}


/* =========================================================
 * 류 세 업무 횟수
 * ======================================================= */

function getLiuCounts(
  workerCounts,
) {
  return LIU_JOBS.map(
    (job) =>
      workerCounts["류"][job],
  );
}


/* =========================================================
 * 박 두 업무 횟수
 * ======================================================= */

function getParkCounts(
  workerCounts,
) {
  return PARK_ALLOWED_JOBS.map(
    (job) =>
      workerCounts["박"][job],
  );
}


/* =========================================================
 * 김·탁·임의 전체 업무 편중
 *
 * 볼분리 계열은 별도 우선순위로 다루므로
 * 여기서는 나머지 세 업무 중심으로 본다.
 * ======================================================= */

function getMainWorkerExtraCounts(
  workerCounts,
) {
  return MAIN_WORKERS.map(
    (worker) => {
      let total = 0;

      for (
        const job of LIU_JOBS
      ) {
        total +=
          workerCounts[worker][job];
      }

      return total;
    },
  );
}


/* =========================================================
 * 개별 작업자의 특정 업무 연속 패널티
 * ======================================================= */

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
      currentJob &&
      previousJob === currentJob
    ) {
      penalty += 1;
    }
  }

  return penalty;
}


/* =========================================================
 * 추가 연속 패널티
 *
 * 월 전체가 완성되었을 때 전체 연속 구간을 계산한다.
 * ======================================================= */

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
 *
 * 빔 탐색에서 사용.
 *
 * 아직 남은 날짜가 있기 때문에
 * 완성 상태 점수와는 다르다.
 * ======================================================= */

function calculatePartialScore(
  state,
  remainingDays,
) {
  const bowlRange =
    getRange(
      getBowlCounts(
        state.workerCounts,
      ),
    );

  const helperRange =
    getRange(
      getBowlHelperCounts(
        state.workerCounts,
      ),
    );

  const liuRange =
    getRange(
      getLiuCounts(
        state.workerCounts,
      ),
    );

  const parkRange =
    getRange(
      getParkCounts(
        state.workerCounts,
      ),
    );

  const mainExtraRange =
    getRange(
      getMainWorkerExtraCounts(
        state.workerCounts,
      ),
    );

  const consecutive =
    calculateConsecutivePenalty(
      state.schedule,
    );

  /*
   * 남은 날짜가 많으면
   * 현재의 작은 차이는 나중에 충분히
   * 보정될 수 있으므로 가중치를 조금 낮춘다.
   */
  const horizonFactor =
    Math.max(
      1,
      remainingDays,
    );

  /*
   * 최우선인 볼분리/볼분리 보조 차이는
   * 가장 강하게 유지한다.
   */
  let score =
    bowlRange * 1000000;

  score +=
    helperRange * 100000;

  score +=
    liuRange * 10000;

  score +=
    mainExtraRange * 1000;

  score +=
    parkRange * 500;

  /*
   * 연속 업무는 장기 균형보다
   * 낮은 우선순위
   */
  score +=
    consecutive * 20;

  /*
   * 너무 빠르게 한쪽에 누적되는 것을 약하게 억제
   */
  score +=
    (horizonFactor > 1
      ? 0
      : consecutive * 2);

  return score;
}


/* =========================================================
 * 월 완성 결과의 최종 점수
 *
 * 이 값이 실제 최종 순위에 가장 중요하다.
 *
 * 우선순위를 숫자로 명확하게 분리한다.
 * ======================================================= */

function calculateFinalScore(
  state,
) {
  const bowlRange =
    getRange(
      getBowlCounts(
        state.workerCounts,
      ),
    );

  const helperRange =
    getRange(
      getBowlHelperCounts(
        state.workerCounts,
      ),
    );

  const liuCounts =
    getLiuCounts(
      state.workerCounts,
    );

  const liuRange =
    getRange(
      liuCounts,
    );

  const mainExtraCounts =
    getMainWorkerExtraCounts(
      state.workerCounts,
    );

  const mainExtraRange =
    getRange(
      mainExtraCounts,
    );

  const parkCounts =
    getParkCounts(
      state.workerCounts,
    );

  const parkRange =
    getRange(
      parkCounts,
    );

  /*
   * 김/탁/임의 전체 업무별 차이 합
   */
  let mainJobSpread = 0;

  for (
    const job of JOBS
  ) {
    const counts =
      MAIN_WORKERS.map(
        (worker) =>
          state.workerCounts[
            worker
          ][job],
      );

    mainJobSpread +=
      getRange(counts);
  }

  /*
   * 류의 세 업무 제곱편차
   *
   * 범위만으로 동률인 경우를 다시 구분
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
   * 박의 두 업무 편차
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

  /*
   * 같은 업무 연속
   */
  const consecutive =
    calculateFullConsecutivePenalty(
      state.schedule,
    );

  /*
   * 최우선 조건 사이에 충분한 차이를 둔다.
   */
  return (
    bowlRange * 1000000000 +
    helperRange * 100000000 +
    liuRange * 10000000 +
    mainExtraRange * 1000000 +
    parkRange * 100000 +
    mainJobSpread * 10000 +
    liuVariance * 1000 +
    parkVariance * 100 +
    consecutive
  );
}


/* =========================================================
 * 상태 시그니처
 *
 * 너무 비슷한 상태를 여러 개 유지하지 않기 위한 용도
 * ======================================================= */

function createStateSignature(
  state,
) {
  const bowl =
    getBowlCounts(
      state.workerCounts,
    ).join(",");

  const helper =
    getBowlHelperCounts(
      state.workerCounts,
    ).join(",");

  const liu =
    getLiuCounts(
      state.workerCounts,
    ).join(",");

  const park =
    getParkCounts(
      state.workerCounts,
    ).join(",");

  const main =
    getMainWorkerExtraCounts(
      state.workerCounts,
    ).join(",");

  let last = "";

  if (
    state.lastAssignment
  ) {
    last = JOBS.map(
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


/* =========================================================
 * 상태 정리
 *
 * 같은 핵심 카운트 상태가 너무 많이 생기면
 * 가장 좋은 몇 개만 남긴다.
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

    const existing =
      grouped.get(
        signature,
      );

    if (
      !existing
    ) {
      grouped.set(
        signature,
        [
          {
            state,
            score,
          },
        ],
      );

      continue;
    }

    existing.push({
      state,
      score,
    });

    existing.sort(
      (a, b) =>
        a.score -
        b.score,
    );

    if (
      existing.length >
      MAX_STATES_PER_SIGNATURE
    ) {
      existing.pop();
    }
  }

  const flattened = [];

  for (
    const group of grouped.values()
  ) {
    for (
      const item of group
    ) {
      flattened.push(item);
    }
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
 * 월 전체 빔 탐색
 * ======================================================= */

function optimizeMonth(
  year,
  month,
  startDay,
  endDay,
) {
  /*
   * 하루 후보는 한 번만 생성
   */
  let dailyCandidates =
    generateDailyCandidates();

  if (
    dailyCandidates.length === 0
  ) {
    throw new Error(
      "현재 설정된 규칙으로 가능한 하루 배정이 없습니다.",
    );
  }

  /*
   * 우연에 의한 결과 편중을 줄이기 위해
   * 후보 순서를 섞는다.
   */
  dailyCandidates =
    shuffle(
      dailyCandidates,
    );

  const dateInfos = [];

  for (
    let day = startDay;
    day <= endDay;
    day += 1
  ) {
    dateInfos.push(
      getDateInfo(
        year,
        month,
        day,
      ),
    );
  }

  let states = [
    createInitialState(),
  ];

  for (
    let dayIndex = 0;
    dayIndex <
      dateInfos.length;
    dayIndex += 1
  ) {
    const dateInfo =
      dateInfos[dayIndex];

    const remainingDays =
      dateInfos.length -
      dayIndex -
      1;

    const nextStates = [];

    for (
      const state of states
    ) {
      for (
        const candidate of dailyCandidates
      ) {
        /*
         * 이전 날짜와 같은 업무가 너무 많이
         * 반복되는 후보도 후보 자체는 유지한다.
         * 최종 점수에서 처리한다.
         */
        const nextState =
          addCandidateToState(
            state,
            candidate,
            dateInfo,
          );

        nextStates.push(
          nextState,
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
      "월 전체 배정 후보를 찾을 수 없습니다.",
    );
  }

  /*
   * 최종 결과를 정확하게 비교
   */
  states.sort(
    (a, b) =>
      calculateFinalScore(a) -
      calculateFinalScore(b),
  );

  /*
   * 최고 점수 그룹에서 무작위로 하나를
   * 선택하여 같은 구조만 반복되는 것을 방지
   */
  const bestScore =
    calculateFinalScore(
      states[0],
    );

  const bestStates =
    states.filter(
      (state) =>
        calculateFinalScore(
          state,
        ) === bestScore,
    );

  const selected =
    bestStates[
      Math.floor(
        Math.random() *
          bestStates.length,
      )
    ];

  return selected.schedule;
}


/* =========================================================
 * 일정 생성 검증
 * ======================================================= */

function validateSchedule(
  schedule,
) {
  const errors = [];

  if (
    !Array.isArray(
      schedule,
    )
  ) {
    errors.push(
      "배정표가 배열 형태가 아닙니다.",
    );

    return errors;
  }

  for (
    const day of schedule
  ) {
    /*
     * 날짜의 모든 업무 확인
     */
    for (
      const job of JOBS
    ) {
      if (!day[job]) {
        errors.push(
          `${day.month}월 ${day.day}일: ${job} 미배정`,
        );
      }
    }

    /*
     * 작업자 중복 확인
     */
    const workers =
      JOBS.map(
        (job) =>
          day[job],
      );

    if (
      new Set(workers).size !==
      WORKERS.length
    ) {
      errors.push(
        `${day.month}월 ${day.day}일: 작업자가 중복되었습니다.`,
      );
    }

    /*
     * 허용 업무 확인
     */
    for (
      const job of JOBS
    ) {
      const worker =
        day[job];

      if (!worker) {
        continue;
      }

      if (
        !isAllowed(
          worker,
          job,
        )
      ) {
        errors.push(
          `${day.month}월 ${day.day}일: ${worker} → ${job}는 규칙에 맞지 않습니다.`,
        );
      }
    }

    /*
     * 하루에 모든 작업자가 정확히 한 번씩
     * 사용되었는지 확인
     */
    for (
      const worker of WORKERS
    ) {
      let count = 0;

      for (
        const job of JOBS
      ) {
        if (
          day[job] === worker
        ) {
          count += 1;
        }
      }

      if (count !== 1) {
        errors.push(
          `${day.month}월 ${day.day}일: ${worker}의 당일 업무 수가 ${count}개입니다.`,
        );
      }
    }
  }

  return errors;
}


/* =========================================================
 * 일정 횟수 계산
 * ======================================================= */

function calculateSummary(
  schedule,
) {
  const workerCounts =
    createEmptyWorkerCounts();

  const jobCounts =
    createEmptyJobCounts();

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

      workerCounts[worker][job] +=
        1;

      jobCounts[job] += 1;
    }
  }

  return {
    workerCounts,
    jobCounts,
  };
}


/* =========================================================
 * 작업자별 업무 가져오기
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

  const firstDay =
    schedule[0];

  const lines = [];

  lines.push(
    `${firstDay.year}년 ${firstDay.month}월 업무 배정표`,
  );

  lines.push("");

  for (
    const day of schedule
  ) {
    lines.push(
      `### ${day.month}월 ${day.day}일`,
    );

    lines.push(
      `김 → ${getJobForWorker(day, "김") || "미배정"}`,
    );

    lines.push(
      `탁 → ${getJobForWorker(day, "탁") || "미배정"}`,
    );

    lines.push(
      `임 → ${getJobForWorker(day, "임") || "미배정"}`,
    );

    lines.push(
      `박 → ${getJobForWorker(day, "박") || "미배정"}`,
    );

    lines.push(
      `류 → ${getJobForWorker(day, "류") || "미배정"}`,
    );

    lines.push("");
  }

  return lines.join("\n");
}


/* =========================================================
 * 업무별 요약 렌더링
 * ======================================================= */

function renderJobSummary() {
  const container =
    document.getElementById(
      "summaryContainer",
    );

  if (!container) {
    return;
  }

  const {
    jobCounts,
  } = calculateSummary(
    currentSchedule,
  );

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
      `${jobCounts[job]}회`;

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
 * 작업자별 횟수 렌더링
 * ======================================================= */

function renderWorkerSummary() {
  const container =
    document.getElementById(
      "workerSummaryContainer",
    );

  if (!container) {
    return;
  }

  const {
    workerCounts,
  } = calculateSummary(
    currentSchedule,
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

    for (
      const job of JOBS
    ) {
      total +=
        workerCounts[
          worker
        ][job];
    }

    const values = [
      worker,
      workerCounts[
        worker
      ]["볼분리"],
      workerCounts[
        worker
      ]["볼분리 보조"],
      workerCounts[
        worker
      ]["설거지 및 성형보조"],
      workerCounts[
        worker
      ]["분쇄 및 성형보조"],
      workerCounts[
        worker
      ]["성형 및 분쇄보조"],
      total,
    ];

    for (
      let index = 0;
      index <
        values.length;
      index += 1
    ) {
      const td =
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

        td.appendChild(
          strong,
        );
      } else {
        td.textContent =
          String(
            values[index],
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

  container.innerHTML = "";

  container.appendChild(
    wrapper,
  );
}


/* =========================================================
 * 결과 렌더링
 * ======================================================= */

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
    validateSchedule(
      currentSchedule,
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
        `${currentSchedule.length}일 생성 완료 · 월 전체 최적화 · 규칙 검증 통과`;
    } else {
      statusElement.textContent =
        `검증 오류 ${errors.length}건`;
    }
  }

  if (
    errors.length > 0
  ) {
    resultElement.textContent +=
      "\n\n[검증 오류]\n" +
      errors.join("\n");
  }

  renderJobSummary();
  renderWorkerSummary();
}


/* =========================================================
 * 날짜 입력 검증
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
      "연도, 월, 시작일, 종료일을 모두 숫자로 입력해주세요.",
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
      `${month}월의 시작일이 올바르지 않습니다.`,
    );
  }

  if (
    endDay < 1 ||
    endDay >
      daysInMonth
  ) {
    throw new Error(
      `${month}월의 종료일이 올바르지 않습니다.`,
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
 * 자동 배정
 * ======================================================= */

function handleGenerate() {
  try {
    const {
      year,
      month,
      startDay,
      endDay,
    } = readDateInputs();

    /*
     * 생성 중임을 화면에 표시
     */
    const statusElement =
      document.getElementById(
        "statusText",
      );

    if (statusElement) {
      statusElement.textContent =
        "월 전체 배정 최적화 중...";
    }

    /*
     * 브라우저 렌더링이 갱신될 시간을 주고
     * 무거운 계산을 실행한다.
     */
    window.setTimeout(
      () => {
        try {
          currentSchedule =
            optimizeMonth(
              year,
              month,
              startDay,
              endDay,
            );

          renderSchedule();
        } catch (error) {
          console.error(
            error,
          );

          if (statusElement) {
            statusElement.textContent =
              "배정 실패";
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
 * 텍스트 복사
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
        "복사에 실패했습니다. 결과 내용을 직접 선택해서 복사해주세요.",
      );
    }

    textarea.remove();
  }
}


/* =========================================================
 * 다크모드
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
      "assignment-app-theme",
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
    "assignment-app-theme",
    isDark
      ? "dark"
      : "light",
  );

  updateThemeButton();
}


/* =========================================================
 * 초기화
 * ======================================================= */

function initializeApp() {
  restoreTheme();

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

  const themeToggle =
    document.getElementById(
      "themeToggle",
    );

  if (
    themeToggle
  ) {
    themeToggle.addEventListener(
      "click",
      handleThemeToggle,
    );
  }
}

document.addEventListener(
  "DOMContentLoaded",
  initializeApp,
);
