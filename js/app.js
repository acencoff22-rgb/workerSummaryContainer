"use strict";

import {
  appData,
  githubConfig,
  currentOriginalSchedule,
  currentSchedule,
  currentOriginalCounts,
  copiedText,
  setAppData,
  setCurrentSchedule,
  setCurrentOriginalSchedule,
  setCurrentOriginalCounts,
  setCopiedText,
  resetRuntimeState,
} from "./state.js";

import {
  normalizeData,
  saveLocalData,
  calculateOriginalCounts as calculateStoredOriginalCounts,
} from "./data.js";

import {
  cleanupOldHistory,
  getStartingCountsForMonth,
  optimizeMonth,
  validateOriginalSchedule,
} from "./assignment.js";

import {
  createEmptyData,
} from "./data.js";

import {
  deepClone,
} from "./data.js";

import {
  getMonthKey,
  formatDateKey,
  getFileDateString,
} from "./utils.js";

import {
  renderSchedule,
  renderEmptySummaries,
  formatScheduleAsText,
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
  loadGithubConfig,
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


function loadInitialLocalData() {
  try {
    const raw =
      localStorage.getItem(
        "assignment-app-data-v6",
      );

    if (!raw) {
      return;
    }

    setAppData(
      normalizeData(
        JSON.parse(raw),
      ),
    );
  } catch (error) {
    console.error(
      "초기 로컬 데이터 불러오기 실패:",
      error,
    );

    setAppData(
      createEmptyData(),
    );
  }
}


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
      appData.history,
    ).length;

  let baselineTotal = 0;

  for (
    const worker of Object.keys(
      appData.baseline,
    )
  ) {
    for (
      const job of Object.keys(
        appData.baseline[worker],
      )
    ) {
      baselineTotal +=
        appData.baseline[worker][job];
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
          calculateStoredOriginalCounts(
            schedule,
          );

        const scheduleWithLeave =
          schedule.map(
            (day) => ({
              ...day,

              leaveWorkers:
                appData.leave[
                  formatDateKey(
                    day.year,
                    day.month,
                    day.day,
                  )
                ]
                  ? [
                      ...appData.leave[
                        formatDateKey(
                          day.year,
                          day.month,
                          day.day,
                        )
                      ],
                    ]
                  : [],
            }),
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

        const nextHistory = {
          ...appData.history,
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

          leave: {},
        };

        for (
          const [
            dateKey,
            workers,
          ] of Object.entries(
            appData.leave,
          )
        ) {
          if (
            dateKey.startsWith(
              `${monthKey}-`,
            )
          ) {
            nextHistory[
              monthKey
            ].leave[dateKey] =
              [...workers];
          }
        }

        setAppData({
          ...appData,
          history:
            nextHistory,
        });

        cleanupOldHistory(
          year,
          month,
        );

        saveLocalData(appData);

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
    }

    textarea.remove();
  }
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
      () => {
        if (
          handleSaveLeave()
        ) {
          renderLeaveList();
          renderCalendar();

          if (
            currentOriginalSchedule.length > 0
          ) {
            renderSchedule();
          }
        }
      },
    );

  document
    .getElementById(
      "clearLeaveButton",
    )
    ?.addEventListener(
      "click",
      () => {
        if (
          handleClearLeaves()
        ) {
          renderLeaveList();
          renderCalendar();

          if (
            currentOriginalSchedule.length > 0
          ) {
            renderSchedule();
          }
        }
      },
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
      async () => {
        const loaded =
          await handleTestGithub();

        if (loaded) {
          resetRuntimeState();

          renderLeaveList();
          renderEmptySummaries();
          renderCalendar();
          updateDataStatus();
        }
      },
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
      async () => {
        const loaded =
          await loadRepositoryData(
            true,
          );

        if (loaded) {
          resetRuntimeState();

          renderLeaveList();
          renderEmptySummaries();
          renderCalendar();
          updateDataStatus();
        }
      },
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
      (event) => {
        handleImport(event);

        window.setTimeout(
          () => {
            updateDataStatus();
          },
          50,
        );
      },
    );

  document
    .getElementById(
      "clearDataButton",
    )
    ?.addEventListener(
      "click",
      () => {
        if (
          handleClearData()
        ) {
          updateDataStatus();
        }
      },
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

  loadInitialLocalData();

  loadGithubConfig();

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

      renderNameSettings();
      updateLeaveWorkerLabels();
      renderLeaveList();
      renderEmptySummaries();
      renderCalendar();
      updateDataStatus();
    }
  }
}


document.addEventListener(
  "DOMContentLoaded",
  initializeApp,
);
