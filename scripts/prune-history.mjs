"use strict";

import fs from "node:fs";
import path from "node:path";

import {
  DATA_VERSION,
  RETENTION_MONTHS,
  WORKERS,
  JOBS,
} from "../js/config.js";

const DATA_FILE = path.resolve(
  "data",
  "history.json",
);

function createEmptyCounts() {
  const result = {};

  for (const worker of WORKERS) {
    result[worker] = {};

    for (const job of JOBS) {
      result[worker][job] = 0;
    }
  }

  return result;
}

function normalizeCounts(input) {
  const result = createEmptyCounts();

  if (
    !input ||
    typeof input !== "object"
  ) {
    return result;
  }

  for (const worker of WORKERS) {
    if (
      !input[worker] ||
      typeof input[worker] !== "object"
    ) {
      continue;
    }

    for (const job of JOBS) {
      const value = Number(
        input[worker][job],
      );

      if (
        Number.isFinite(value) &&
        value >= 0
      ) {
        result[worker][job] =
          Math.floor(value);
      }
    }
  }

  return result;
}

function addCounts(target, source) {
  for (const worker of WORKERS) {
    for (const job of JOBS) {
      target[worker][job] +=
        source[worker][job];
    }
  }
}

function getMonthNumber(
  year,
  month,
) {
  return (
    Number(year) * 12 +
    Number(month)
  );
}

function parseMonthKey(key) {
  const match =
    /^(\d{4})-(\d{2})$/.exec(key);

  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
  };
}

function sortMonthKeys(keys) {
  return [...keys].sort(
    (a, b) =>
      a.localeCompare(b),
  );
}

function getKeepKeys(
  latestKey,
) {
  const latest =
    parseMonthKey(
      latestKey,
    );

  if (!latest) {
    return new Set();
  }

  const latestNumber =
    getMonthNumber(
      latest.year,
      latest.month,
    );

  const keep = new Set();

  for (
    let offset =
      RETENTION_MONTHS - 1;
    offset >= 0;
    offset -= 1
  ) {
    const target =
      latestNumber - offset;

    const year =
      Math.floor(
        (target - 1) / 12,
      );

    const month =
      ((target - 1) % 12) + 1;

    const key =
      `${year}-${String(month).padStart(2, "0")}`;

    keep.add(key);
  }

  return keep;
}

function main() {
  if (
    !fs.existsSync(
      DATA_FILE,
    )
  ) {
    throw new Error(
      `데이터 파일이 없습니다: ${DATA_FILE}`,
    );
  }

  const raw =
    fs.readFileSync(
      DATA_FILE,
      "utf-8",
    );

  const data =
    JSON.parse(raw);

  if (
    !data ||
    typeof data !== "object"
  ) {
    throw new Error(
      "history.json 형식이 올바르지 않습니다.",
    );
  }

  data.version = DATA_VERSION;
  data.retentionMonths =
    RETENTION_MONTHS;

  data.baseline =
    normalizeCounts(
      data.baseline,
    );

  if (
    !data.history ||
    typeof data.history !== "object"
  ) {
    data.history = {};
  }

  const validHistoryEntries =
    Object.entries(
      data.history,
    ).filter(
      ([key, value]) =>
        /^\d{4}-\d{2}$/.test(
          key,
        ) &&
        value &&
        typeof value === "object",
    );

  if (
    validHistoryEntries.length === 0
  ) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        data,
        null,
        2,
      ) + "\n",
      "utf-8",
    );

    console.log(
      "히스토리 데이터가 없어 정리할 내용이 없습니다.",
    );

    return;
  }

  const sortedKeys =
    sortMonthKeys(
      validHistoryEntries.map(
        ([key]) => key,
      ),
    );

  const latestKey =
    sortedKeys[
      sortedKeys.length - 1
    ];

  const keepKeys =
    getKeepKeys(
      latestKey,
    );

  const oldKeys =
    sortedKeys.filter(
      (key) =>
        !keepKeys.has(key),
    );

  if (
    oldKeys.length === 0
  ) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        data,
        null,
        2,
      ) + "\n",
      "utf-8",
    );

    console.log(
      `정리 필요 없음. 최근 ${RETENTION_MONTHS}개월을 유지합니다.`,
    );

    return;
  }

  let removedCount = 0;

  for (
    const monthKey of oldKeys
  ) {
    const monthData =
      data.history[
        monthKey
      ];

    const counts =
      normalizeCounts(
        monthData.originalCounts,
      );

    addCounts(
      data.baseline,
      counts,
    );

    delete data.history[
      monthKey
    ];

    removedCount += 1;
  }

  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(
      data,
      null,
      2,
    ) + "\n",
    "utf-8",
  );

  console.log(
    `오래된 기록 ${removedCount}개월을 baseline으로 압축했습니다.`,
  );

  console.log(
    `현재 상세 기록: ${Object.keys(
      data.history,
    )
      .sort(
        (a, b) =>
          a.localeCompare(b),
      )
      .join(", ")}`,
  );
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : error,
  );

  process.exit(1);
}
