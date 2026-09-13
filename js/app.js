"use strict";

import {
  appData,
  githubConfig,
  currentOriginalSchedule,
  copiedText,
  setAppData,
  setCurrentSchedule,
  setCurrentOriginalSchedule,
  setCurrentOriginalCounts,
  setCopiedText,
  resetRuntimeState,
} from "./state.js";

import {
  createEmptyData,
  loadLocalData,
  saveLocalData,
  calculateOriginalCounts,
  deepClone,
} from "./data.js";

import {
  cleanupOldHistory,
  getStartingCountsForMonth,
  optimizeMonth,
} from "./assignment.js";

import {
  getMonthKey,
  formatDateKey,
} from "./utils.js";

import {
  renderSchedule,
  renderEmptySummaries,
} from "./render.js";

import {
  renderLeaveList,
  handleSaveLeave,
  handleClearLeaves,
  loadLeaveCheckboxes,
} from "./leave.js";

import {
  renderCalendar,
  moveCalendarMonth,
  updateCalendarToGeneratedMonth,
  closeDayDetail,
  handleDayDetailLeave,
} from "./calendar.js";

import {
  renderNameSettings,
  updateLeaveWorkerLabels,
  handleSaveNameSettings,
  handleResetNameSettings,
} from "./settings.js";

import {
  restoreTheme,
  handleThemeToggle,
} from "./theme.js";

import {
  initializeGithubConfig,
  updateGithubForm,
  updateGithubConfigStatus,
  handleSaveGithubConfig,
  handleTestGithub,
  handlePrepareGithub,
  handleOpenGithubEdit,
  loadRepositoryData,
} from "./github.js";

import {
  handleCopyJson,
  handleExport,
  handleImport,
  handleClearData,
} from "./backup.js";

import {
  handlePrintSchedule,
  handlePrintCalendar,
} from "./print.js";


let initialized = false;


function updateDataStatus() {
  const element =
    document.getElementById(
      "dataStatus",
    );

  if (!element) {
    return;
  }

  const historyCount =
    Object.keys(
      appData.history || {},
    ).length;

  let baselineTotal = 0;

  for (
    const worker of Object.keys(
      appData.baseline || {},
    )
  ) {
    for (
      const job of Object.keys(
        appData.baseline?.[worker] || {},
      )
    ) {
      baselineTotal +=
        Number(
          appData.baseline[worker][job] || 0,
        );
    }
  }

  if (
    historyCount === 0 &&
    baselineTotal === 0
  ) {
    element.textContent =
      "누적 데이터 없음";

    return;
  }

  element.textContent =
    `상세 기록 ${historyCount}개월 · 압축 누적 ${baselineTotal}건`;
}


function updateNameSettingsStatus(
  message,
  success = true,
) {
  const element =
    document.getElementById(
      "nameSettingsStatus",
    );

  if (!element) {
    return;
  }

  element.textContent =
    message;

  element.classList.toggle(
    "success",
    success,
  );
}


function refreshAll() {
  renderNameSettings();
  updateLeaveWorkerLabels();
  renderLeaveList();

  if (
    currentOriginalSchedule.length > 0
  ) {
    renderSchedule();
  } else {
    renderEmptySummaries();
    renderCalendar();
  }

  updateDataStatus();
}


function refreshLeaveAndCalendar() {
  renderLeaveList();

  if (
    currentOriginalSchedule.length > 0
  ) {
    renderSchedule();
  } else {
    renderCalendar();
  }

  updateDataStatus();
}


function handleSaveNameSettingsAndRender() {
  const saved =
    handleSaveNameSettings();

  if (!saved) {
    return;
  }

  renderNameSettings();
  updateLeaveWorkerLabels();

  if (
    currentOriginalSchedule.length > 0
  ) {
    renderSchedule();
  } else {
    renderEmptySummaries();
    renderCalendar();
  }

  renderLeaveList();
  updateDataStatus();

  updateNameSettingsStatus(
    "이름 및 업무명을 저장했습니다. GitHub에도 반영하려면 GitHub 저장 준비를 실행하세요.",
  );
}


function handleResetNameSettingsAndRender() {
  const reset =
    handleResetNameSettings();

  if (!reset) {
    return;
  }

  renderNameSettings();
  updateLeaveWorkerLabels();

  if (
    currentOriginalSchedule.length > 0
  ) {
    renderSchedule();
  } else {
    renderEmptySummaries();
    renderCalendar();
  }

  renderLeaveList();
  updateDataStatus();

  updateNameSettingsStatus(
    "기본 이름과 업무명으로 되돌렸습니다.",
  );
}


function handleGenerate() {
  let inputs;

  try {
    inputs =
      readDateInputs();
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "입력값을 확인해주세요.",
    );

    return;
  }

  const status =
    document.getElementById(
      "statusText",
    );

  if (status) {
    status.textContent =
      "월 전체 최적화 중...";

    status.classList.remove(
      "success",
    );
  }

  window.setTimeout(
    () => {
      try {
        const {
          year,
          month,
          startDay,
          endDay,
        } = inputs;

        updateCalendarToGeneratedMonth();

        cleanupOldHistory(
          year,
          month,
        );

        const startingCounts =
          getStartingCountsForMonth(
            year,
            month,
          );

        const schedule =
          optimizeMonth(
            year,
            month,
            startDay,
            endDay,
            startingCounts,
          );

        const originalCounts =
          calculateOriginalCounts(
            schedule,
          );

        const scheduleWithLeave =
          schedule.map(
            (day) => {
              const dateKey =
                formatDateKey(
                  day.year,
                  day.month,
                  day.day,
                );

              return {
                ...day,

                leaveWorkers: [
                  ...(
                    appData.leave?.[
                      dateKey
                    ] || []
                  ),
                ],
              };
            },
          );

        setCurrentOriginalSchedule(
          schedule,
        );

        setCurrentOriginalCounts(
          originalCounts,
        );

        setCurrentSchedule(
          scheduleWithLeave,
        );

        const monthKey =
          getMonthKey(
            year,
            month,
          );

        const monthLeave = {};

        for (
          const [
            dateKey,
            workers,
          ] of Object.entries(
            appData.leave || {},
          )
        ) {
          if (
            dateKey.startsWith(
              `${monthKey}-`,
            )
          ) {
            monthLeave[dateKey] = [
              ...workers,
            ];
          }
        }

        const nextHistory = {
          ...(appData.history || {}),
        };

        nextHistory[monthKey] = {
          schedule:
            deepClone(
              schedule,
            ),

          originalCounts:
            deepClone(
              originalCounts,
            ),

          leave:
            monthLeave,
        };

        const nextData = {
          ...appData,

          history:
            nextHistory,
        };

        setAppData(
          nextData,
        );

        cleanupOldHistory(
          year,
          month,
        );

        saveLocalData(
          appData,
        );

        renderSchedule();
        renderLeaveList();
        updateDataStatus();
      } catch (error) {
        console.error(
          "배정 실패:",
          error,
        );

        if (status) {
          status.textContent =
            "배정 실패";

          status.classList.remove(
            "success",
          );
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
}


function readDateInputs() {
  const year =
    Number(
      document.getElementById(
        "yearInput",
      )?.value,
    );

  const month =
    Number(
      document.getElementById(
        "monthInput",
      )?.value,
    );

  const startDay =
    Number(
      document.getElementById(
        "startDayInput",
      )?.value,
    );

  const endDay =
    Number(
      document.getElementById(
        "endDayInput",
      )?.value,
    );

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(startDay) ||
    !Number.isInteger(endDay)
  ) {
    throw new Error(
      "연도, 월, 시작일, 종료일을 확인해주세요.",
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
    startDay > daysInMonth
  ) {
    throw new Error(
      "시작일이 올바르지 않습니다.",
    );
  }

  if (
    endDay < 1 ||
    endDay > daysInMonth
  ) {
    throw new Error(
      "종료일이 올바르지 않습니다.",
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


async function handleCopy() {
  if (!copiedText) {
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

    document.body.appendChild(
      textarea,
    );

    textarea.focus();
    textarea.select();

    try {
      document.execCommand("copy");

      alert(
        "배정표가 복사되었습니다.",
      );
    } catch (copyError) {
      console.error(
        copyError,
      );

      alert(
        "복사에 실패했습니다.",
      );
    } finally {
      textarea.remove();
    }
  }
}


async function handleRepositoryLoad() {
  const loaded =
    await loadRepositoryData(
      true,
    );

  if (!loaded) {
    return;
  }

  resetRuntimeState();

  refreshAll();
}


function handleSaveLeaveAndRender() {
  const saved =
    handleSaveLeave();

  if (!saved) {
    return;
  }

  refreshLeaveAndCalendar();
}


function handleClearLeavesAndRender() {
  const cleared =
    handleClearLeaves();

  if (!cleared) {
    return;
  }

  refreshLeaveAndCalendar();
}


async function handleImportAndRefresh(
  event,
) {
  handleImport(event);

  window.setTimeout(
    () => {
      refreshAll();
    },
    50,
  );
}


function handleClearDataAndRefresh() {
  const cleared =
    handleClearData();

  if (!cleared) {
    return;
  }

  refreshAll();
}


function bindEvents() {
  document
    .getElementById(
      "saveNameSettingsButton",
    )
    ?.addEventListener(
      "click",
      handleSaveNameSettingsAndRender,
    );

  document
    .getElementById(
      "resetNameSettingsButton",
    )
    ?.addEventListener(
      "click",
      handleResetNameSettingsAndRender,
    );

  document
    .getElementById(
      "generateButton",
    )
    ?.addEventListener(
      "click",
      handleGenerate,
    );

  document
    .getElementById(
      "copyButton",
    )
    ?.addEventListener(
      "click",
      handleCopy,
    );

  document
    .getElementById(
      "printButton",
    )
    ?.addEventListener(
      "click",
      handlePrintSchedule,
    );

  document
    .getElementById(
      "printCalendarButton",
    )
    ?.addEventListener(
      "click",
      handlePrintCalendar,
    );

  document
    .getElementById(
      "themeToggle",
    )
    ?.addEventListener(
      "click",
      handleThemeToggle,
    );

  document
    .getElementById(
      "previousMonthButton",
    )
    ?.addEventListener(
      "click",
      () =>
        moveCalendarMonth(-1),
    );

  document
    .getElementById(
      "nextMonthButton",
    )
    ?.addEventListener(
      "click",
      () =>
        moveCalendarMonth(1),
    );

  document
    .getElementById(
      "saveLeaveButton",
    )
    ?.addEventListener(
      "click",
      handleSaveLeaveAndRender,
    );

  document
    .getElementById(
      "clearLeaveButton",
    )
    ?.addEventListener(
      "click",
      handleClearLeavesAndRender,
    );

  document
    .getElementById(
      "saveGithubConfigButton",
    )
    ?.addEventListener(
      "click",
      handleSaveGithubConfig,
    );

  document
    .getElementById(
      "testGithubButton",
    )
    ?.addEventListener(
      "click",
      handleRepositoryLoad,
    );

  document
    .getElementById(
      "prepareGithubButton",
    )
    ?.addEventListener(
      "click",
      handlePrepareGithub,
    );

  document
    .getElementById(
      "copyJsonButton",
    )
    ?.addEventListener(
      "click",
      handleCopyJson,
    );

  document
    .getElementById(
      "openGithubEditButton",
    )
    ?.addEventListener(
      "click",
      handleOpenGithubEdit,
    );

  document
    .getElementById(
      "loadRepositoryButton",
    )
    ?.addEventListener(
      "click",
      handleRepositoryLoad,
    );

  document
    .getElementById(
      "exportButton",
    )
    ?.addEventListener(
      "click",
      handleExport,
    );

  document
    .getElementById(
      "importInput",
    )
    ?.addEventListener(
      "change",
      handleImportAndRefresh,
    );

  document
    .getElementById(
      "clearDataButton",
    )
    ?.addEventListener(
      "click",
      handleClearDataAndRefresh,
    );

  document
    .getElementById(
      "leaveDateInput",
    )
    ?.addEventListener(
      "change",
      (event) => {
        loadLeaveCheckboxes(
          event.target.value,
        );
      },
    );

  document
    .querySelectorAll(
      "[data-leave-worker]",
    )
    .forEach(
      (checkbox) => {
        checkbox.addEventListener(
          "change",
          () => {
            // 저장 버튼을 눌렀을 때만 실제 데이터에 반영한다.
          },
        );
      },
    );

  document
    .getElementById(
      "yearInput",
    )
    ?.addEventListener(
      "change",
      () => {
        updateCalendarToGeneratedMonth();
        renderCalendar();
      },
    );

  document
    .getElementById(
      "monthInput",
    )
    ?.addEventListener(
      "change",
      () => {
        updateCalendarToGeneratedMonth();
        renderCalendar();
      },
    );

  document
    .getElementById(
      "closeDayDetailButton",
    )
    ?.addEventListener(
      "click",
      closeDayDetail,
    );

  document
    .getElementById(
      "dayDetailCloseButton",
    )
    ?.addEventListener(
      "click",
      closeDayDetail,
    );

  document
    .getElementById(
      "dayDetailLeaveButton",
    )
    ?.addEventListener(
      "click",
      handleDayDetailLeave,
    );

  document
    .getElementById(
      "dayDetailModal",
    )
    ?.addEventListener(
      "click",
      (event) => {
        if (
          event.target.classList.contains(
            "modal-backdrop",
          )
        ) {
          closeDayDetail();
        }
      },
    );

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape"
      ) {
        closeDayDetail();
      }
    },
  );
}


async function initializeApp() {
  if (initialized) {
    return;
  }

  initialized = true;

  restoreTheme();

  const localData =
    loadLocalData();

  setAppData(
    localData || createEmptyData(),
  );

  initializeGithubConfig();

  updateGithubForm();
  updateGithubConfigStatus();

  renderNameSettings();
  updateLeaveWorkerLabels();

  renderLeaveList();
  renderEmptySummaries();

  updateDataStatus();

  updateCalendarToGeneratedMonth();
  renderCalendar();

  bindEvents();

  if (
    githubConfig.owner &&
    githubConfig.repo
  ) {
    const loaded =
      await loadRepositoryData(
        false,
      );

    if (loaded) {
      resetRuntimeState();
      refreshAll();
    }
  }
}


document.addEventListener(
  "DOMContentLoaded",
  initializeApp,
);
