"use strict";

import {
  DATA_VERSION,
  RETENTION_MONTHS,
  WORKERS,
  JOBS,
  STORAGE_KEY,
  GITHUB_CONFIG_KEY,
} from "./config.js";


export function createEmptyWorkerCounts() {
  const result = {};

  for (const worker of WORKERS) {
    result[worker] = {};

    for (const job of JOBS) {
      result[worker][job] = 0;
    }
  }

  return result;
}


export function createDefaultNameSettings() {
  return {
    workers: Object.fromEntries(
      WORKERS.map((worker) => [
        worker,
        worker,
      ]),
    ),

    jobs: Object.fromEntries(
      JOBS.map((job) => [
        job,
        job,
      ]),
    ),
  };
}


export function normalizeNameSettings(input) {
  const defaults =
    createDefaultNameSettings();

  const result = {
    workers: {
      ...defaults.workers,
    },

    jobs: {
      ...defaults.jobs,
    },
  };

  if (
    input &&
    typeof input === "object"
  ) {
    if (
      input.workers &&
      typeof input.workers === "object"
    ) {
      for (const worker of WORKERS) {
        const value =
          String(
            input.workers[worker] ?? "",
          ).trim();

        if (value) {
          result.workers[worker] =
            value;
        }
      }
    }

    if (
      input.jobs &&
      typeof input.jobs === "object"
    ) {
      for (const job of JOBS) {
        const value =
          String(
            input.jobs[job] ?? "",
          ).trim();

        if (value) {
          result.jobs[job] =
            value;
        }
      }
    }
  }

  return result;
}


export function normalizeWorkerCounts(input) {
  const result =
    createEmptyWorkerCounts();

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
      const value =
        Number(
          input[worker][job] ?? 0,
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


export function normalizeLeaveMap(input) {
  const result = {};

  if (
    !input ||
    typeof input !== "object"
  ) {
    return result;
  }

  for (
    const [
      dateKey,
      workers,
    ] of Object.entries(input)
  ) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        dateKey,
      )
    ) {
      continue;
    }

    if (!Array.isArray(workers)) {
      continue;
    }

    result[dateKey] =
      WORKERS.filter(
        (worker) =>
          workers.includes(worker),
      );
  }

  return result;
}


export function normalizeHistory(history) {
  const result = {};

  if (
    !history ||
    typeof history !== "object"
  ) {
    return result;
  }

  for (
    const [
      monthKey,
      monthData,
    ] of Object.entries(history)
  ) {
    if (
      !/^\d{4}-\d{2}$/.test(
        monthKey,
      )
    ) {
      continue;
    }

    if (
      !monthData ||
      typeof monthData !== "object"
    ) {
      continue;
    }

    result[monthKey] = {
      schedule:
        Array.isArray(
          monthData.schedule,
        )
          ? monthData.schedule
          : [],

      originalCounts:
        normalizeWorkerCounts(
          monthData.originalCounts,
        ),

      leave:
        normalizeLeaveMap(
          monthData.leave,
        ),
    };
  }

  return result;
}


export function createEmptyData() {
  return {
    version:
      DATA_VERSION,

    retentionMonths:
      RETENTION_MONTHS,

    baseline:
      createEmptyWorkerCounts(),

    names:
      createDefaultNameSettings(),

    history: {},

    leave: {},
  };
}


export function createEmptyGithubConfig() {
  return {
    owner: "",
    repo: "",
    branch: "main",
    dataPath:
      "data/history.json",
  };
}


export function normalizeData(input) {
  if (
    !input ||
    typeof input !== "object"
  ) {
    return createEmptyData();
  }

  return {
    version:
      DATA_VERSION,

    retentionMonths:
      RETENTION_MONTHS,

    baseline:
      normalizeWorkerCounts(
        input.baseline,
      ),

    names:
      normalizeNameSettings(
        input.names,
      ),

    history:
      normalizeHistory(
        input.history,
      ),

    leave:
      normalizeLeaveMap(
        input.leave,
      ),
  };
}


export function deepClone(value) {
  return JSON.parse(
    JSON.stringify(value),
  );
}


export function addWorkerCounts(
  base,
  extra,
) {
  const result =
    normalizeWorkerCounts(base);

  const source =
    normalizeWorkerCounts(extra);

  for (const worker of WORKERS) {
    for (const job of JOBS) {
      result[worker][job] +=
        source[worker][job];
    }
  }

  return result;
}


export function addAssignmentToCounts(
  counts,
  assignment,
) {
  const result =
    normalizeWorkerCounts(counts);

  for (const job of JOBS) {
    const worker =
      assignment[job];

    if (!worker) {
      continue;
    }

    result[worker][job] += 1;
  }

  return result;
}


export function calculateOriginalCounts(
  schedule,
) {
  const result =
    createEmptyWorkerCounts();

  for (const day of schedule) {
    for (const job of JOBS) {
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


export function loadLocalData() {
  try {
    const raw =
      localStorage.getItem(
        STORAGE_KEY,
      );

    if (!raw) {
      return false;
    }

    return normalizeData(
      JSON.parse(raw),
    );
  } catch (error) {
    console.error(
      "로컬 데이터 불러오기 실패:",
      error,
    );

    return false;
  }
}


export function saveLocalData(data) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(data),
    );

    return true;
  } catch (error) {
    console.error(
      "로컬 데이터 저장 실패:",
      error,
    );

    return false;
  }
}


export function loadGithubConfig() {
  try {
    const raw =
      localStorage.getItem(
        GITHUB_CONFIG_KEY,
      );

    if (!raw) {
      return createEmptyGithubConfig();
    }

    return {
      ...createEmptyGithubConfig(),
      ...JSON.parse(raw),
    };
  } catch (error) {
    console.error(
      "GitHub 설정 불러오기 실패:",
      error,
    );

    return createEmptyGithubConfig();
  }
}


export function saveGithubConfig(config) {
  localStorage.setItem(
    GITHUB_CONFIG_KEY,
    JSON.stringify(config),
  );
}
