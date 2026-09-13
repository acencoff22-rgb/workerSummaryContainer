"use strict";

import {
  WORKERS,
  JOBS,
} from "./config.js";

import {
  appData,
  setAppData,
} from "./state.js";

import {
  createDefaultNameSettings,
  saveLocalData,
} from "./data.js";


export function getWorkerLabel(
  worker,
) {
  return (
    appData?.names?.workers?.[worker] ||
    worker
  );
}


export function getJobLabel(
  job,
) {
  return (
    appData?.names?.jobs?.[job] ||
    job
  );
}


export function renderNameSettings() {
  const workerContainer =
    document.getElementById(
      "workerNameSettings",
    );

  const jobContainer =
    document.getElementById(
      "jobNameSettings",
    );

  if (workerContainer) {
    workerContainer.innerHTML =
      "";

    WORKERS.forEach(
      (
        worker,
        index,
      ) => {
        const label =
          document.createElement(
            "label",
          );

        label.className =
          "name-setting-item";

        const title =
          document.createElement(
            "span",
          );

        title.textContent =
          `작업자 ${index + 1}`;

        const input =
          document.createElement(
            "input",
          );

        input.type = "text";
        input.className =
          "worker-name-input";
        input.dataset.worker =
          worker;
        input.maxLength = 30;
        input.value =
          getWorkerLabel(worker);

        label.appendChild(title);
        label.appendChild(input);

        workerContainer.appendChild(
          label,
        );
      },
    );
  }

  if (jobContainer) {
    jobContainer.innerHTML =
      "";

    JOBS.forEach(
      (
        job,
        index,
      ) => {
        const label =
          document.createElement(
            "label",
          );

        label.className =
          "name-setting-item";

        const title =
          document.createElement(
            "span",
          );

        title.textContent =
          `업무 ${index + 1}`;

        const input =
          document.createElement(
            "input",
          );

        input.type = "text";
        input.className =
          "job-name-input";
        input.dataset.job =
          job;
        input.maxLength = 50;
        input.value =
          getJobLabel(job);

        label.appendChild(title);
        label.appendChild(input);

        jobContainer.appendChild(
          label,
        );
      },
    );
  }
}


export function updateLeaveWorkerLabels() {
  document
    .querySelectorAll(
      "[data-worker-label]",
    )
    .forEach(
      (element) => {
        const worker =
          element.dataset.workerLabel;

        element.textContent =
          getWorkerLabel(worker);
      },
    );
}


export function handleSaveNameSettings() {
  const workerInputs =
    [
      ...document.querySelectorAll(
        ".worker-name-input",
      ),
    ];

  const jobInputs =
    [
      ...document.querySelectorAll(
        ".job-name-input",
      ),
    ];

  const workers = {};
  const jobs = {};

  if (
    workerInputs.length !==
    WORKERS.length
  ) {
    alert(
      "작업자 이름 설정 화면을 찾을 수 없습니다.",
    );

    return false;
  }

  if (
    jobInputs.length !==
    JOBS.length
  ) {
    alert(
      "업무명 설정 화면을 찾을 수 없습니다.",
    );

    return false;
  }

  for (
    const input of workerInputs
  ) {
    const value =
      input.value.trim();

    if (!value) {
      alert(
        "작업자 이름은 비워둘 수 없습니다.",
      );

      input.focus();

      return false;
    }

    workers[
      input.dataset.worker
    ] = value;
  }

  for (
    const input of jobInputs
  ) {
    const value =
      input.value.trim();

    if (!value) {
      alert(
        "업무명은 비워둘 수 없습니다.",
      );

      input.focus();

      return false;
    }

    jobs[
      input.dataset.job
    ] = value;
  }

  const workerValues =
    Object.values(
      workers,
    );

  const jobValues =
    Object.values(
      jobs,
    );

  if (
    new Set(workerValues).size !==
    workerValues.length
  ) {
    alert(
      "작업자 이름은 서로 다르게 입력해주세요.",
    );

    return false;
  }

  if (
    new Set(jobValues).size !==
    jobValues.length
  ) {
    alert(
      "업무명은 서로 다르게 입력해주세요.",
    );

    return false;
  }

  const nextData = {
    ...appData,

    names: {
      workers,
      jobs,
    },
  };

  setAppData(
    nextData,
  );

  saveLocalData(
    nextData,
  );

  return true;
}


export function handleResetNameSettings() {
  const confirmed =
    window.confirm(
      "작업자 이름과 업무명을 기본값으로 되돌릴까요?",
    );

  if (!confirmed) {
    return false;
  }

  const nextData = {
    ...appData,

    names:
      createDefaultNameSettings(),
  };

  setAppData(
    nextData,
  );

  saveLocalData(
    nextData,
  );

  return true;
}
