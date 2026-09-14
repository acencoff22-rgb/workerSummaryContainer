"use strict";

import {
  calculateOriginalCounts,
  createEmptyData,
} from "../js/data.js";
import { appData, setAppData } from "../js/state.js";
import {
  cleanupOldHistory,
  getOptimizationStats,
  getStartingCountsForMonth,
  optimizeMonth,
  resetOptimizationStats,
  validateOriginalSchedule,
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

function verifyThirtySixMonths() {
  const data = createEmptyData();
  setAppData(data);
  resetOptimizationStats();

  const failures = [];
  const timings = [];
  const start = Date.now();

  for (let offset = 0; offset < 36; offset += 1) {
    const year = 2023 + Math.floor(offset / 12);
    const month = (offset % 12) + 1;
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;
    const monthStart = Date.now();

    try {
      const starting =
        getStartingCountsForMonth(
          year,
          month,
        );

      const schedule =
        optimizeMonth(
          year,
          month,
          1,
          30,
          starting,
        );

      const errors =
        validateOriginalSchedule(schedule);

      assert(
        errors.length === 0,
        `${monthKey}: 규칙 위반 ${errors.length}건`,
      );

      assert(
        schedule.length === 30,
        `${monthKey}: 배정일수 ${schedule.length}일 / 30일`,
      );

      appData.history[monthKey] = {
        schedule,
        originalCounts:
          calculateOriginalCounts(schedule),
        leave: {},
      };

      cleanupOldHistory(year, month);
      timings.push(Date.now() - monthStart);
    } catch (error) {
      failures.push(
        `${monthKey}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const stats = getOptimizationStats();
  const totalMs = Date.now() - start;
  const maxMonthMs = timings.length > 0
    ? Math.max(...timings)
    : 0;

  assert(
    failures.length === 0,
    `36개월 시뮬레이션 실패 ${failures.length}건: ${failures.join(" / ")}`,
  );

  assert(
    stats.total === 36,
    `36개월 최적화 호출 수 오류: ${stats.total}`,
  );

  console.log(
    `36개월: OK (실패 0, quota ${stats.quotaSuccess}, fallback ${stats.fallbackUsed}, 최대 ${maxMonthMs}ms, 총 ${totalMs}ms)`,
  );
}

function verifyFallbackPath() {
  const data = createEmptyData();
  setAppData(data);
  resetOptimizationStats();

  let seed = 1;
  const startingCounts = createEmptyData().baseline;

  for (const worker of WORKERS) {
    for (const job of JOBS) {
      seed = (
        (seed * 1664525 + 1013904223) | 0
      );
      startingCounts[worker][job] =
        Math.abs(seed) % 80;
    }
  }

  const schedule =
    optimizeMonth(
      2026,
      9,
      15,
      30,
      startingCounts,
    );

  const errors =
    validateOriginalSchedule(schedule);

  const stats =
    getOptimizationStats();

  assert(
    errors.length === 0,
    `fallback 규칙 위반 ${errors.length}건`,
  );

  assert(
    stats.fallbackUsed === 1,
    `fallback 미실행: ${JSON.stringify(stats)}`,
  );

  console.log(
    "fallback: OK",
    JSON.stringify(stats),
  );
}

function verifyAllDayRanges() {
  const data = createEmptyData();
  setAppData(data);
  resetOptimizationStats();

  const year = 2026;
  const month = 1;
  const daysInMonth = 31;

  const failures = [];
  let comboCount = 0;
  const start = Date.now();

  for (
    let startDay = 1;
    startDay < daysInMonth;
    startDay += 1
  ) {
    for (
      let endDay = startDay + 1;
      endDay <= daysInMonth;
      endDay += 1
    ) {
      comboCount += 1;

      const starting =
        getStartingCountsForMonth(
          year,
          month,
        );

      try {
        const schedule =
          optimizeMonth(
            year,
            month,
            startDay,
            endDay,
            starting,
          );

        const errors =
          validateOriginalSchedule(
            schedule,
          );

        const days =
          endDay - startDay + 1;

        if (errors.length > 0) {
          failures.push(
            `${startDay}-${endDay}: 규칙 위반 ${errors.length}건`,
          );
          continue;
        }

        if (
          schedule.length !== days
        ) {
          failures.push(
            `${startDay}-${endDay}: 배정일수 ${schedule.length}일 / ${days}일`,
          );
        }
      } catch (error) {
        failures.push(
          `${startDay}-${endDay}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  const totalMs =
    Date.now() - start;

  const stats =
    getOptimizationStats();

  assert(
    comboCount === 465,
    `날짜 구간 조합 수 오류: ${comboCount} / 465`,
  );

  assert(
    failures.length === 0,
    `날짜 구간 검증 실패 ${failures.length}건: ${failures.slice(0, 5).join(" / ")}`,
  );

  console.log(
    `날짜 구간 465개: OK (quota ${stats.quotaSuccess}, fallback ${stats.fallbackUsed}, 총 ${totalMs}ms)`,
  );
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

verifyFallbackPath();

verifyAllDayRanges();

verifyThirtySixMonths();

console.log("모든 자동 검증 통과");
