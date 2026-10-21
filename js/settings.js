"use strict";

import {
  WORKERS,
  JOBS,
  DEFAULT_WORKERS,
  DEFAULT_JOBS,
  setRoster,
} from "./config.js";

import {
  appData,
  setAppData,
} from "./state.js";

import {
  createDefaultNameSettings,
  saveLocalData,
} from "./data.js";

let rosterChangeHandler = () => {};


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

        if (WORKERS.length > 1) {
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "secondary-button planner-remove";
          remove.textContent = "삭제";
          remove.addEventListener("click", () => removeRosterItem("workers", worker));
          label.appendChild(remove);
        }

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

        if (JOBS.length > 1) {
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "secondary-button planner-remove";
          remove.textContent = "삭제";
          remove.addEventListener("click", () => removeRosterItem("jobs", job));
          label.appendChild(remove);
        }

        jobContainer.appendChild(
          label,
        );
      },
    );
  }
}

function removeRosterItem(type, key) {
  if (!window.confirm("이 항목을 명단에서 삭제할까요? 이후 배정부터 반영됩니다.")) return;
  const nextWorkers = type === "workers" ? WORKERS.filter((item) => item !== key) : [...WORKERS];
  const nextJobs = type === "jobs" ? JOBS.filter((item) => item !== key) : [...JOBS];
  setRoster(nextWorkers, nextJobs);
  const names = { workers: { ...appData.names.workers }, jobs: { ...appData.names.jobs } };
  delete names[type][key];
  const nextData = { ...appData, names };
  setAppData(nextData);
  saveLocalData(nextData);
  localStorage.setItem("assignment-app-roster-v1", JSON.stringify({ workers: nextWorkers, jobs: nextJobs }));
  renderNameSettings();
  rosterChangeHandler();
}

export function bindRosterControls(onChange) {
  rosterChangeHandler = onChange || (() => {});
  const add = (type, inputId) => {
    const input = document.getElementById(inputId);
    const value = input.value.trim();
    if (!value) return;
    const items = type === "workers" ? WORKERS : JOBS;
    const labels = appData.names[type] || {};
    if (items.some((item) => (labels[item] || item).toLocaleLowerCase() === value.toLocaleLowerCase())) {
      alert("같은 이름이 이미 있습니다.");
      return;
    }
    const key = `custom-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const workers = type === "workers" ? [...WORKERS, key] : [...WORKERS];
    const jobs = type === "jobs" ? [...JOBS, key] : [...JOBS];
    setRoster(workers, jobs);
    const names = { workers: { ...appData.names.workers }, jobs: { ...appData.names.jobs } };
    names[type][key] = value;
    const nextData = { ...appData, names };
    setAppData(nextData);
    saveLocalData(nextData);
    localStorage.setItem("assignment-app-roster-v1", JSON.stringify({ workers, jobs }));
    input.value = "";
    renderNameSettings();
    onChange?.();
  };
  document.getElementById("addPlannerWorker")?.addEventListener("click", () => add("workers", "newPlannerWorker"));
  document.getElementById("addPlannerJob")?.addEventListener("click", () => add("jobs", "newPlannerJob"));
}


export function updateLeaveWorkerLabels() {
  const checkboxContainer = document.querySelector(".worker-checkboxes");
  if (checkboxContainer) {
    const selected = new Set([...checkboxContainer.querySelectorAll("[data-leave-worker]:checked")].map((input) => input.value));
    checkboxContainer.replaceChildren();
    for (const worker of WORKERS) {
      const label = document.createElement("label");
      label.className = "checkbox-label";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = worker;
      input.dataset.leaveWorker = "";
      input.checked = selected.has(worker);
      const text = document.createElement("span");
      text.dataset.workerLabel = worker;
      text.textContent = getWorkerLabel(worker);
      label.append(input, text);
      checkboxContainer.append(label);
    }
  }
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

  setRoster(DEFAULT_WORKERS, DEFAULT_JOBS);
  localStorage.removeItem("assignment-app-roster-v1");

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
