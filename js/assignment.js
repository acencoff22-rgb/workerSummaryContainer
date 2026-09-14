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

export function isAllowed(worker, job) {
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

export function getJobForWorker(day, worker) {
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

export function getStartingCountsForMonth(year, month) {
  let counts =
    normalizeWorkerCounts(appData.baseline);

  const targetMonth =
    getMonthKey(year, month);

  const rollingKeys =
    new Set(
      getRollingMonthKeys(
        year,
        month,
        RETENTION_MONTHS,
      ),
    );

  for (const [monthKey, monthData] of Object.entries(
    appData.history || {},
  )) {
    if (monthKey === targetMonth) {
      continue;
    }

    if (!rollingKeys.has(monthKey)) {
      continue;
    }

    if (!monthData?.originalCounts) {
      continue;
    }

    counts = addWorkerCounts(
      counts,
      monthData.originalCounts,
    );
  }

  return counts;
}


/* =========================================================
 * 균형 유틸리티
 * ======================================================= */

function compareTuple(a, b) {
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;

    if (av < bv) {
      return -1;
    }

    if (av > bv) {
      return 1;
    }
  }

  return 0;
}


function getBalancedDistributions(
  currentCounts,
  allowedWorkers,
  days,
) {
  const distributions = [];
  const allocation =
    Object.fromEntries(
      allowedWorkers.map((worker) => [worker, 0]),
    );

  function visit(index, remaining) {
    if (index === allowedWorkers.length - 1) {
      const worker = allowedWorkers[index];
      allocation[worker] = remaining;

      const finals = allowedWorkers.map(
        (name) =>
          currentCounts[name] + allocation[name],
      );

      const range = getRange(finals);
      const mean =
        finals.reduce(
          (sum, value) => sum + value,
          0,
        ) / finals.length;

      const variance = finals.reduce(
        (sum, value) =>
          sum + Math.pow(value - mean, 2),
        0,
      );

      distributions.push({
        additions: { ...allocation },
        finals,
        range,
        variance,
      });

      return;
    }

    const worker = allowedWorkers[index];

    for (let amount = 0; amount <= remaining; amount += 1) {
      allocation[worker] = amount;
      visit(index + 1, remaining - amount);
    }
  }

  visit(0, days);

  distributions.sort((a, b) =>
    compareTuple(
      [a.range, a.variance],
      [b.range, b.variance],
    ),
  );

  return distributions;
}


function chooseBowlAndHelperTargets(
  startingCounts,
  days,
) {
  const bowlStart =
    Object.fromEntries(
      MAIN_WORKERS.map((worker) => [
        worker,
        startingCounts[worker]["볼분리"],
      ]),
    );

  const helperStart =
    Object.fromEntries(
      MAIN_WORKERS.map((worker) => [
        worker,
        startingCounts[worker]["볼분리 보조"],
      ]),
    );

  const bowlOptions =
    getBalancedDistributions(
      bowlStart,
      MAIN_WORKERS,
      days,
    );

  const bestBowlRange =
    bowlOptions[0]?.range ?? 0;

  const bestBowls =
    bowlOptions.filter(
      (item) => item.range === bestBowlRange,
    );

  const helperOptions =
    getBalancedDistributions(
      helperStart,
      MAIN_WORKERS,
      days,
    );

  const bestHelperRange =
    helperOptions[0]?.range ?? 0;

  const bestHelpers =
    helperOptions.filter(
      (item) => item.range === bestHelperRange,
    );

  let best = null;

  for (const bowl of bestBowls) {
    for (const helper of bestHelpers) {
      const lowerCapacity = MAIN_WORKERS.map(
        (worker) =>
          days -
          bowl.additions[worker] -
          helper.additions[worker],
      );

      const capacityRange =
        getRange(lowerCapacity);

      const capacityMean =
        lowerCapacity.reduce(
          (sum, value) => sum + value,
          0,
        ) / lowerCapacity.length;

      const capacityVariance =
        lowerCapacity.reduce(
          (sum, value) =>
            sum + Math.pow(value - capacityMean, 2),
          0,
        );

      const candidate = {
        bowl,
        helper,
        lowerCapacity,
        capacityRange,
        capacityVariance,
      };

      if (!best) {
        best = candidate;
        continue;
      }

      const comparison = compareTuple(
        [
          candidate.capacityRange,
          candidate.capacityVariance,
          bowl.variance,
          helper.variance,
        ],
        [
          best.capacityRange,
          best.capacityVariance,
          best.bowl.variance,
          best.helper.variance,
        ],
      );

      if (comparison < 0) {
        best = candidate;
      }
    }
  }

  return best;
}


/* =========================================================
 * 최소 비용 흐름
 * ======================================================= */

function createGraph(nodeCount) {
  return Array.from(
    { length: nodeCount },
    () => [],
  );
}


function addEdge(
  graph,
  from,
  to,
  capacity,
  cost,
) {
  const forward = {
    to,
    rev: graph[to].length,
    capacity,
    cost,
  };

  const reverse = {
    to: from,
    rev: graph[from].length,
    capacity: 0,
    cost: -cost,
  };

  graph[from].push(forward);
  graph[to].push(reverse);
}


function shortestPathMinCostFlow(
  graph,
  source,
  sink,
  requiredFlow,
) {
  let flow = 0;
  let totalCost = 0;

  const nodeCount = graph.length;

  while (flow < requiredFlow) {
    const distance =
      Array(nodeCount).fill(Infinity);

    const previousNode =
      Array(nodeCount).fill(-1);

    const previousEdge =
      Array(nodeCount).fill(-1);

    const inQueue =
      Array(nodeCount).fill(false);

    const queue = [];
    let head = 0;

    distance[source] = 0;
    queue.push(source);
    inQueue[source] = true;

    while (head < queue.length) {
      const node = queue[head];
      head += 1;
      inQueue[node] = false;

      for (
        let edgeIndex = 0;
        edgeIndex < graph[node].length;
        edgeIndex += 1
      ) {
        const edge =
          graph[node][edgeIndex];

        if (edge.capacity <= 0) {
          continue;
        }

        const nextDistance =
          distance[node] + edge.cost;

        if (
          nextDistance <
          distance[edge.to]
        ) {
          distance[edge.to] =
            nextDistance;

          previousNode[edge.to] =
            node;

          previousEdge[edge.to] =
            edgeIndex;

          if (!inQueue[edge.to]) {
            queue.push(edge.to);
            inQueue[edge.to] = true;
          }
        }
      }
    }

    if (!Number.isFinite(distance[sink])) {
      throw new Error(
        "업무별 목표량을 만족하는 배정 조합을 찾지 못했습니다.",
      );
    }

    let augment =
      requiredFlow - flow;

    let node = sink;

    while (node !== source) {
      const from = previousNode[node];
      const edgeIndex = previousEdge[node];

      if (from < 0 || edgeIndex < 0) {
        throw new Error(
          "최소 비용 흐름 경로 복원에 실패했습니다.",
        );
      }

      augment = Math.min(
        augment,
        graph[from][edgeIndex].capacity,
      );

      node = from;
    }

    node = sink;

    while (node !== source) {
      const from = previousNode[node];
      const edgeIndex = previousEdge[node];
      const edge =
        graph[from][edgeIndex];

      edge.capacity -= augment;
      graph[node][edge.rev].capacity +=
        augment;

      node = from;
    }

    flow += augment;
    totalCost +=
      distance[sink] * augment;
  }

  return {
    flow,
    totalCost,
  };
}


function calculateMarginalSquaredCost(
  currentFinal,
  targetFinal,
  scale,
) {
  const before =
    Math.pow(
      currentFinal - targetFinal,
      2,
    );

  const after =
    Math.pow(
      currentFinal + 1 - targetFinal,
      2,
    );

  return Math.round(
    (after - before) * scale,
  );
}


function buildLowerQuotaMatrix(
  startingCounts,
  days,
  mainLowerCapacity,
) {
  const nodeCount = 1 + 5 + 3 + 1;

  const source = 0;
  const mainStart = 1;
  const parkNode = mainStart + 3;
  const liuNode = mainStart + 4;
  const jobStart = mainStart + 5;
  const sink = jobStart + 3;

  const graph =
    createGraph(nodeCount);

  const SCALE = 1000;

  const edgeRecords = [];

  for (
    let index = 0;
    index < MAIN_WORKERS.length;
    index += 1
  ) {
    const workerNode =
      mainStart + index;

    const capacity =
      mainLowerCapacity[index];

    addEdge(
      graph,
      source,
      workerNode,
      capacity,
      0,
    );
  }

  addEdge(
    graph,
    source,
    parkNode,
    days,
    0,
  );

  addEdge(
    graph,
    source,
    liuNode,
    days,
    0,
  );

  /*
   * 김/탁/임의 lower-job 목표.
   * 각 사람의 lower 총량을 3개 업무에
   * 최대한 균등하게 나누되, 기존 누적값도 고려한다.
   */
  for (
    let workerIndex = 0;
    workerIndex < MAIN_WORKERS.length;
    workerIndex += 1
  ) {
    const worker =
      MAIN_WORKERS[workerIndex];

    const rowCapacity =
      mainLowerCapacity[workerIndex];

    const averageCapacity =
      mainLowerCapacity.reduce(
        (sum, value) => sum + value,
        0,
      ) / mainLowerCapacity.length;

    for (
      let jobIndex = 0;
      jobIndex < 3;
      jobIndex += 1
    ) {
      const job = JOBS[jobIndex + 2];

      const averageStart =
        MAIN_WORKERS.reduce(
          (sum, name) =>
            sum + startingCounts[name][job],
          0,
        ) / MAIN_WORKERS.length;

      const targetFinal =
        averageStart +
        days / 9 +
        (rowCapacity - averageCapacity) / 3;

      const currentFinal =
        startingCounts[worker][job];

      for (
        let unit = 1;
        unit <= rowCapacity;
        unit += 1
      ) {
        const marginalCost =
          calculateMarginalSquaredCost(
            currentFinal + unit - 1,
            targetFinal,
            SCALE,
          );

        const edgeIndex =
          graph[mainStart + workerIndex].length;

        addEdge(
          graph,
          mainStart + workerIndex,
          jobStart + jobIndex,
          1,
          marginalCost,
        );

        edgeRecords.push({
          type: "main",
          workerIndex,
          jobIndex,
          edgeIndex,
        });
      }
    }
  }

  /*
   * 박: 설거지/분쇄를 최대한 균등하게.
   */
  {
    const currentFinals =
      PARK_ALLOWED_JOBS.map(
        (job) =>
          startingCounts.박[job],
      );

    const targetFinal =
      currentFinals.reduce(
        (sum, value) => sum + value,
        0,
      ) / 2 +
      days / 2;

    for (let jobIndex = 0; jobIndex < 2; jobIndex += 1) {
      const job =
        PARK_ALLOWED_JOBS[jobIndex];

      const currentFinal =
        startingCounts.박[job];

      for (
        let unit = 1;
        unit <= days;
        unit += 1
      ) {
        const marginalCost =
          calculateMarginalSquaredCost(
            currentFinal + unit - 1,
            targetFinal,
            SCALE * 2,
          );

        const edgeIndex =
          graph[parkNode].length;

        addEdge(
          graph,
          parkNode,
          jobStart + jobIndex,
          1,
          marginalCost,
        );

        edgeRecords.push({
          type: "park",
          jobIndex,
          edgeIndex,
        });
      }
    }
  }

  /*
   * 류: 3개 업무를 최대한 균등하게.
   */
  {
    const currentFinals =
      LIU_JOBS.map(
        (job) =>
          startingCounts.류[job],
      );

    const targetFinal =
      currentFinals.reduce(
        (sum, value) => sum + value,
        0,
      ) / 3 +
      days / 3;

    for (
      let jobIndex = 0;
      jobIndex < 3;
      jobIndex += 1
    ) {
      const job =
        LIU_JOBS[jobIndex];

      const currentFinal =
        startingCounts.류[job];

      for (
        let unit = 1;
        unit <= days;
        unit += 1
      ) {
        const marginalCost =
          calculateMarginalSquaredCost(
            currentFinal + unit - 1,
            targetFinal,
            SCALE,
          );

        const edgeIndex =
          graph[liuNode].length;

        addEdge(
          graph,
          liuNode,
          jobStart + jobIndex,
          1,
          marginalCost,
        );

        edgeRecords.push({
          type: "liu",
          jobIndex,
          edgeIndex,
        });
      }
    }
  }

  for (let jobIndex = 0; jobIndex < 3; jobIndex += 1) {
    addEdge(
      graph,
      jobStart + jobIndex,
      sink,
      days,
      0,
    );
  }

  const totalFlow =
    mainLowerCapacity.reduce(
      (sum, value) => sum + value,
      0,
    ) +
    days * 2;

  shortestPathMinCostFlow(
    graph,
    source,
    sink,
    totalFlow,
  );

  const matrix =
    MAIN_WORKERS.map(
      () =>
        Array(3).fill(0),
    );

  const park =
    Array(3).fill(0);

  const liu =
    Array(3).fill(0);

  for (const record of edgeRecords) {
    let node;

    if (record.type === "main") {
      node =
        mainStart +
        record.workerIndex;
    } else if (record.type === "park") {
      node = parkNode;
    } else {
      node = liuNode;
    }

    const edge =
      graph[node][record.edgeIndex];

    if (edge.capacity !== 0) {
      continue;
    }

    if (record.type === "main") {
      matrix[record.workerIndex][record.jobIndex] +=
        1;
    } else if (record.type === "park") {
      park[record.jobIndex] += 1;
    } else {
      liu[record.jobIndex] += 1;
    }
  }

  return {
    main: matrix,
    park,
    liu,
  };
}


/* =========================================================
 * 목표량 → 일별 배정표
 * ======================================================= */

function buildQuotaMatrix(
  startingCounts,
  days,
) {
  const target =
    chooseBowlAndHelperTargets(
      startingCounts,
      days,
    );

  if (!target) {
    throw new Error(
      "볼분리/볼분리 보조 목표량을 계산하지 못했습니다.",
    );
  }

  const lower =
    buildLowerQuotaMatrix(
      startingCounts,
      days,
      target.lowerCapacity,
    );

  const matrix =
    WORKERS.map(
      () =>
        JOBS.map(() => 0),
    );

  for (
    let workerIndex = 0;
    workerIndex < MAIN_WORKERS.length;
    workerIndex += 1
  ) {
    const worker =
      MAIN_WORKERS[workerIndex];

    matrix[workerIndex][0] =
      target.bowl.additions[worker];

    matrix[workerIndex][1] =
      target.helper.additions[worker];

    for (let jobIndex = 0; jobIndex < 3; jobIndex += 1) {
      matrix[workerIndex][jobIndex + 2] =
        lower.main[workerIndex][jobIndex];
    }
  }

  const parkIndex =
    WORKERS.indexOf("박");

  matrix[parkIndex][2] = lower.park[0];
  matrix[parkIndex][3] = lower.park[1];
  matrix[parkIndex][4] = 0;

  const liuIndex =
    WORKERS.indexOf("류");

  matrix[liuIndex][2] = lower.liu[0];
  matrix[liuIndex][3] = lower.liu[1];
  matrix[liuIndex][4] = lower.liu[2];

  /*
   * 최종 검증:
   * 모든 작업자는 days회,
   * 모든 업무도 days회여야 한다.
   */
  for (let workerIndex = 0; workerIndex < WORKERS.length; workerIndex += 1) {
    const rowTotal = matrix[workerIndex].reduce(
      (sum, value) => sum + value,
      0,
    );

    if (rowTotal !== days) {
      throw new Error(
        `${WORKERS[workerIndex]} 목표 업무량이 ${days}회가 아닙니다. 실제 ${rowTotal}회`,
      );
    }
  }

  for (let jobIndex = 0; jobIndex < JOBS.length; jobIndex += 1) {
    const columnTotal = matrix.reduce(
      (sum, row) => sum + row[jobIndex],
      0,
    );

    if (columnTotal !== days) {
      throw new Error(
        `${JOBS[jobIndex]} 목표량이 ${days}회가 아닙니다. 실제 ${columnTotal}회`,
      );
    }
  }

  return matrix;
}


function findPerfectMatchingsForRemaining(
  remaining,
) {
  const candidates = [];

  function visit(
    jobIndex,
    usedWorkers,
    assignment,
  ) {
    if (jobIndex === JOBS.length) {
      candidates.push({ ...assignment });
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

      usedWorkers.add(workerIndex);
      assignment[jobIndex] = workerIndex;

      visit(
        jobIndex + 1,
        usedWorkers,
        assignment,
      );

      usedWorkers.delete(workerIndex);
      delete assignment[jobIndex];
    }
  }

  visit(0, new Set(), {});

  return candidates;
}


function calculateDailyConsecutivePenalty(
  previous,
  candidate,
) {
  if (!previous) {
    return 0;
  }

  let penalty = 0;

  for (let jobIndex = 0; jobIndex < JOBS.length; jobIndex += 1) {
    const job = JOBS[jobIndex];
    const worker = WORKERS[candidate[jobIndex]];

    if (previous[job] === worker) {
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
    findPerfectMatchingsForRemaining(
      remaining,
    );

  if (candidates.length === 0) {
    throw new Error(
      "남은 목표량을 만족하는 일일 배정이 없습니다.",
    );
  }

  let best = null;

  for (const candidate of candidates) {
    const consecutive =
      calculateDailyConsecutivePenalty(
        previous,
        candidate,
      );

    /*
     * 다음 날에도 선택지가 많이 남는 후보를 선호한다.
     * 현재는 각 행/열 합이 같으므로 단순 잔여 edge 수를 사용한다.
     */
    let flexibility = 0;

    for (let workerIndex = 0; workerIndex < WORKERS.length; workerIndex += 1) {
      for (let jobIndex = 0; jobIndex < JOBS.length; jobIndex += 1) {
        if (remaining[workerIndex][jobIndex] > 0) {
          flexibility += 1;
        }
      }
    }

    const candidateKey =
      JOBS.map(
        (job, jobIndex) =>
          `${jobIndex}:${candidate[jobIndex]}`,
      ).join("|");

    const score = [
      consecutive,
      -flexibility,
      candidateKey,
    ];

    if (!best || compareTuple(score.slice(0, 2), best.score.slice(0, 2)) < 0) {
      best = {
        candidate,
        score,
      };
    }
  }

  return best.candidate;
}


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

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const matching =
      chooseNextDailyMatching(
        remaining,
        previous,
      );

    const assignment = {};

    for (let jobIndex = 0; jobIndex < JOBS.length; jobIndex += 1) {
      const workerIndex =
        matching[jobIndex];

      const worker =
        WORKERS[workerIndex];

      const job =
        JOBS[jobIndex];

      assignment[job] = worker;
      remaining[workerIndex][jobIndex] -= 1;
    }

    schedules.push(assignment);
    previous = matching;
  }

  for (let workerIndex = 0; workerIndex < WORKERS.length; workerIndex += 1) {
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

  const days = dates.length;

  if (days <= 0) {
    throw new Error(
      "배정할 날짜가 없습니다.",
    );
  }

  const dailyCandidates =
    createDailyCandidates();

  if (dailyCandidates.length === 0) {
    throw new Error(
      "현재 규칙으로 가능한 하루 배정이 없습니다.",
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

  return dailyAssignments.map(
    (assignment, index) => ({
      ...dates[index],
      ...assignment,
    }),
  );
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
        (job) => day?.[job],
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
      new Set(assignedWorkers).size !==
      WORKERS.length
    ) {
      errors.push(
        `${day.month}월 ${day.day}일: 작업자 중복`,
      );
    }

    for (const job of JOBS) {
      const worker = day[job];

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

  for (const [monthKey, monthData] of Object.entries(history)) {
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
