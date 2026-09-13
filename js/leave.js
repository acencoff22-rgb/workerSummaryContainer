"use strict";

import {
  WORKERS,
} from "./config.js";

import {
  appData,
  setAppData,
  selectedDetailDateKey,
} from "./state.js";

import {
  saveLocalData,
} from "./data.js";

import {
  formatDisplayDate,
} from "./utils.js";

import {
  getJobForWorker,
} from "./assignment.js";

import {
  getWorkerLabel,
  getJobLabel,
} from "./settings.js";


export function getLeaveWorkers(
  dateKey,
) {
  return [
    ...(appData.leave[dateKey] || []),
  ];
}


export function setLeaveWorkers(
  dateKey,
  workers,
) {
  const normalized =
    WORKERS.filter(
      (worker) =>
        workers.includes(worker),
    );

  const nextLeave = {
    ...appData.leave,
  };

  if (
    normalized.length === 0
  ) {
    delete nextLeave[dateKey];
  } else {
    nextLeave[dateKey] =
      normalized;
  }

  setAppData({
    ...appData,
    leave: nextLeave,
  });

  saveLocalData(appData);
}


export function getLeaveMapForMonth(
  year,
  month,
  getMonthKey,
) {
  const prefix =
    getMonthKey(
      year,
      month,
    );

  const result = {};

  for (
    const [
      dateKey,
      workers,
    ] of Object.entries(appData.leave)
  ) {
    if (
      dateKey.startsWith(
        `${prefix}-`,
      )
    ) {
      result[dateKey] =
        [...workers];
    }
  }

  return result;
}


export function loadLeaveCheckboxes(
  dateKey,
) {
  const workers =
    getLeaveWorkers(
      dateKey,
    );

  document
    .querySelectorAll(
      "[data-leave-worker]",
    )
    .forEach(
      (checkbox) => {
        checkbox.checked =
          workers.includes(
            checkbox.value,
          );
      },
    );
}


export function handleSaveLeave() {
  const input =
    document.getElementById(
      "leaveDateInput",
    );

  if (
    !input ||
    !input.value
  ) {
    alert(
      "연차 날짜를 선택해주세요.",
    );

    return false;
  }

  const workers =
    [
      ...document.querySelectorAll(
        "[data-leave-worker]:checked",
      ),
    ].map(
      (checkbox) =>
        checkbox.value,
    );

  if (
    workers.length === 0
  ) {
    alert(
      "연차자를 한 명 이상 선택해주세요.",
    );

    return false;
  }

  setLeaveWorkers(
    input.value,
    workers,
  );

  input.value = "";

  document
    .querySelectorAll(
      "[data-leave-worker]",
    )
    .forEach(
      (checkbox) => {
        checkbox.checked = false;
      },
    );

  return true;
}


export function handleClearLeaves() {
  const confirmed =
    window.confirm(
      "등록된 연차를 모두 삭제할까요?",
    );

  if (!confirmed) {
    return false;
  }

  setAppData({
    ...appData,
    leave: {},
  });

  saveLocalData(appData);

  return true;
}


export function deleteLeave(
  dateKey,
) {
  const nextLeave = {
    ...appData.leave,
  };

  delete nextLeave[dateKey];

  setAppData({
    ...appData,
    leave: nextLeave,
  });

  saveLocalData(appData);
}


export function renderLeaveList() {
  const container =
    document.getElementById(
      "leaveList",
    );

  if (!container) {
    return;
  }

  const entries =
    Object.entries(
      appData.leave,
    ).sort(
      (a, b) =>
        a[0].localeCompare(b[0]),
    );

  if (
    entries.length === 0
  ) {
    container.innerHTML = `
      <div class="empty-state">
        등록된 연차가 없습니다.
      </div>
    `;

    return;
  }

  container.innerHTML = "";

  for (
    const [
      dateKey,
      workers,
    ] of entries
  ) {
    const item =
      document.createElement(
        "div",
      );

    item.className =
      "leave-item";

    const main =
      document.createElement(
        "div",
      );

    main.className =
      "leave-item-main";

    const date =
      document.createElement(
        "div",
      );

    date.className =
      "leave-date";

    date.textContent =
      formatDisplayDate(
        dateKey,
      );

    const workersText =
      document.createElement(
        "div",
      );

    workersText.className =
      "leave-workers";

    workersText.textContent =
      workers
        .map(getWorkerLabel)
        .join(" · ");

    main.appendChild(date);
    main.appendChild(workersText);

    const deleteButton =
      document.createElement(
        "button",
      );

    deleteButton.type =
      "button";

    deleteButton.className =
      "leave-delete-button";

    deleteButton.textContent =
      "삭제";

    deleteButton.addEventListener(
      "click",
      () => {
        deleteLeave(dateKey);
        renderLeaveList();
        loadLeaveCheckboxes(dateKey);
      },
    );

    item.appendChild(main);
    item.appendChild(deleteButton);

    container.appendChild(item);
  }
}


export function validateLeaveDate(
  dateKey,
) {
  return /^\d{4}-\d{2}-\d{2}$/.test(
    dateKey,
  );
}
