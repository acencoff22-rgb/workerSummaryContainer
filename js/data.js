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


export function createEmptyJobCounts() {
  const result = {};

  for (const job of JOBS) {
    result[job] = 0;
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
          result.jobs[job] = value;
        }
      }
    }
  }

  return result;
}


export function normalizeWorkerCounts(
  input,
) {
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


export function normalizeLeaveMap(
  input,
) {
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


export function normalizeHistory(
  history,
) {
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

  const history =
    normalizeHistory(
      input.history,
    );

  /*
   * 이전 버전 데이터에서는 연차가
   * history["YYYY-MM"].leave 안에만 들어 있을 수 있다.
   * 현재 구조는 top-level leave를 사용하므로,
   * 로드할 때 두 형식을 하나로 합쳐 호환성을 유지한다.
   */
  const leave =
    normalizeLeaveMap(
      input.leave,
    );

  for (
    const monthData of Object.values(
      history,
    )
  ) {
    if (
      !monthData?.leave
    ) {
      continue;
    }

    const monthLeave =
      normalizeLeaveMap(
        monthData.leave,
      );

    for (
      const [
        dateKey,
        workers,
      ] of Object.entries(
        monthLeave,
      )
    ) {
      if (
        !leave[dateKey]
      ) {
        leave[dateKey] = [
          ...workers,
        ];
      } else {
        leave[dateKey] =
          WORKERS.filter(
            (worker) =>
              leave[dateKey].includes(worker) ||
              workers.includes(worker),
          );
      }
    }
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

    history,

    leave,
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

    if (
      !result[worker] ||
      !Object.hasOwn(
        result[worker],
        job,
      )
    ) {
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

  if (!Array.isArray(schedule)) {
    return result;
  }

  for (const day of schedule) {
    if (!day) {
      continue;
    }

    for (const job of JOBS) {
      const worker =
        day[job];

      if (!worker) {
        continue;
      }

      if (
        !result[worker] ||
        !Object.hasOwn(
          result[worker],
          job,
        )
      ) {
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
      return null;
    }

    return normalizeData(
      JSON.parse(raw),
    );
  } catch (error) {
    console.error(
      "로컬 데이터 불러오기 실패:",
      error,
    );

    return null;
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

    const parsed =
      JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !== "object"
    ) {
      return createEmptyGithubConfig();
    }

    return {
      ...createEmptyGithubConfig(),
      ...parsed,
    };
  } catch (error) {
    console.error(
      "GitHub 설정 불러오기 실패:",
      error,
    );

    return createEmptyGithubConfig();
  }
}


export function saveGithubConfig(
  config,
) {
  try {
    localStorage.setItem(
      GITHUB_CONFIG_KEY,
      JSON.stringify(config),
    );

    return true;
  } catch (error) {
    console.error(
      "GitHub 설정 저장 실패:",
      error,
    );

    return false;
  }
}
