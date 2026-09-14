"use strict";

import { createEmptyData } from "../js/data.js";
import { setAppData } from "../js/state.js";
import {
  optimizeMonth,
  validateOriginalSchedule,
  getStartingCountsForMonth,
} from "../js/assignment.js";
import {
  WORKERS,
  JOBS,
} from "../js/config.js";

function tally(schedule) {
  const counts = {};

  for (const worker of WORKERS) {
    counts[worker] = {};
    for (const job of JOBS) {
      counts[worker][job] = 0;
    }
  }

  for (const day of schedule) {
    for (const job of JOBS) {
      counts[day[job]][job] += 1;
    }
  }

  return counts;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function verifyZeroCounts(startDay, endDay) {
  const data = createEmptyData();
  setAppData(data);

  const starting =
    getStartingCountsForMonth(
      2026,
      9,
    );

  const schedule =
    optimizeMonth(
      2026,
      9,
      startDay,
      endDay,
      starting,
    );

  const counts = tally(schedule);
  const errors =
    validateOriginalSchedule(schedule);

  assert(
    errors.length === 0,
    `${startDay}-${endDay}: 규칙 위반 ${errors.length}건`,
  );

  const days = endDay - startDay + 1;

  for (const worker of WORKERS) {
    const total = JOBS.reduce(
      (sum, job) =>
        sum + counts[worker][job],
      0,
    );

    assert(
      total === days,
      `${worker}: 총 ${total}회 / ${days}회`,
    );
  }

  for (const job of JOBS) {
    const total = WORKERS.reduce(
      (sum, worker) =>
        sum + counts[worker][job],
      0,
    );

    assert(
      total === days,
      `${job}: 총 ${total}회 / ${days}회`,
    );
  }

  return counts;
}

function verifyHistoricalCounts() {
  const data = createEmptyData();

  const months = [
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
  ];

  for (const monthKey of months) {
    const originalCounts =
      createEmptyData().baseline;

    for (const worker of WORKERS) {
      for (const job of JOBS) {
        originalCounts[worker][job] =
          2;
      }
    }

    data.history[monthKey] = {
      schedule: [],
      originalCounts,
      leave: {},
    };
  }

  setAppData(data);

  const starting =
    getStartingCountsForMonth(
      2026,
      9,
    );

  for (const worker of WORKERS) {
    for (const job of JOBS) {
      assert(
        starting[worker][job] === 10,
        `history 누적 오류: ${worker}/${job}=${starting[worker][job]}`,
      );
    }
  }

  const schedule =
    optimizeMonth(
      2026,
      9,
      15,
      30,
      starting,
    );

  const errors =
    validateOriginalSchedule(schedule);

  assert(
    errors.length === 0,
    `history 배정 규칙 위반 ${errors.length}건`,
  );
}



const cases = [
  [1, 1],
  [1, 7],
  [1, 15],
  [1, 30],
  [1, 31],
  [15, 30],
];

for (const [startDay, endDay] of cases) {
  const counts =
    verifyZeroCounts(
      startDay,
      endDay,
    );

  console.log(
    `${startDay}-${endDay}: OK`,
    JSON.stringify(counts),
  );
}

verifyHistoricalCounts();
console.log("history: OK");

console.log("모든 자동 검증 통과");
