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
  getDaysInMonth,
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

let isGenerating = false;

let optimizeWorker = null;


/*
 * 배정표 생성은 계산량이 많아 수 초~수십 초가 걸릴 수 있다.
 * 메인 스레드에서 그대로 돌리면 그동안 화면이 멈춘 것처럼
 * 보이므로, 가능하면 별도 Web Worker에서 계산하고
 * 메인 스레드는 계속 응답 가능한 상태로 둔다.
 *
 * (구형 브라우저 등 Worker를 못 쓰는 환경에서는
 * 기존처럼 메인 스레드에서 계산하는 방식으로 대체한다.)
 */
function getOptimizeWorker() {
  if (typeof Worker === "undefined") {
    return null;
  }

  if (optimizeWorker) {
    return optimizeWorker;
  }

  try {
    optimizeWorker = new Worker(
      new URL(
        "./optimize-worker.js",
        import.meta.url,
      ),
      { type: "module" },
    );
  } catch (error) {
    console.error(
      "워커 생성 실패, 메인 스레드에서 계산합니다:",
      error,
    );

    optimizeWorker = null;
  }

  return optimizeWorker;
}


function runOptimizeMonthAsync(
  params,
) {
  const worker =
    getOptimizeWorker();

  if (!worker) {
    return Promise.resolve().then(
      () =>
        optimizeMonth(
          params.year,
          params.month,
          params.startDay,
          params.endDay,
          params.startingCounts,
        ),
    );
  }

  return new Promise(
    (resolve, reject) => {
      const handleMessage = (
        event,
      ) => {
        cleanup();

        if (event.data?.ok) {
          resolve(
            event.data.schedule,
          );
        } else {
          reject(
            new Error(
              event.data
                ?.message ||
                "배정표 생성 중 오류가 발생했습니다.",
            ),
          );
        }
      };

      const handleError = (
        error,
      ) => {
        cleanup();

        /*
         * Web Worker 자체가 실패한 경우에는
         * 고장난 Worker를 다음 생성에 재사용하지 않는다.
         */
        try {
          worker.terminate();
        } catch (terminateError) {
          console.error(
            "워커 종료 실패:",
            terminateError,
          );
        }

        optimizeWorker = null;

        /*
         * Worker 로딩/실행 오류라면
         * 메인 스레드에서 한 번 재시도한다.
         */
        try {
          const schedule =
            optimizeMonth(
              params.year,
              params.month,
              params.startDay,
              params.endDay,
              params.startingCounts,
            );

          resolve(schedule);
        } catch (fallbackError) {
          console.error(
            "메인 스레드 재시도 실패:",
            fallbackError,
          );

          reject(
            fallbackError ||
            error ||
            new Error(
              "배정표 생성 중 오류가 발생했습니다.",
            ),
          );
        }
      };

      function cleanup() {
        worker.removeEventListener(
          "message",
          handleMessage,
        );

        worker.removeEventListener(
          "error",
          handleError,
        );
      }

      worker.addEventListener(
        "message",
        handleMessage,
      );

      worker.addEventListener(
        "error",
        handleError,
      );

      try {
        worker.postMessage(params);
      } catch (error) {
        handleError(error);
      }
    },
  );
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


function refreshScheduleOrCalendar() {
  if (
    currentOriginalSchedule.length > 0
  ) {
    renderSchedule();
  } else {
    renderCalendar();
  }

  updateDataStatus();
}


function refreshLeaveAndCalendar() {
  renderLeaveList();
  refreshScheduleOrCalendar();
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


async function handleGenerate() {
  if (isGenerating) {
    return;
  }

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

  const generateButton =
    document.getElementById(
      "generateButton",
    );

  if (status) {
    status.textContent =
      "월 전체 최적화 중...";

    status.classList.remove(
      "success",
    );
  }

  isGenerating = true;

  if (generateButton) {
    generateButton.disabled =
      true;
  }

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
      await runOptimizeMonthAsync(
        {
          year,
          month,
          startDay,
          endDay,
          startingCounts,
        },
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
  } finally {
    isGenerating = false;

    if (generateButton) {
      generateButton.disabled =
        false;
    }
  }
}


/*
 * index.html의 연/월/시작일/종료일 입력값은
 * 처음 배포됐던 시점(2026년 9월)의 값이 그대로
 * 박혀 있어서, 다음 달부터는 매번 손으로 고쳐야 했다.
 *
 * 앱을 열 때 오늘 날짜 기준으로 자동으로 채워준다.
 * (사용자가 값을 바꾼 뒤에는 그 값을 그대로 존중한다 —
 * 이 함수는 초기화 시점에 한 번만 호출된다.)
 */
function setDefaultDateInputsToToday() {
  const today =
    new Date();

  const year =
    today.getFullYear();

  const month =
    today.getMonth() + 1;

  const daysInMonth =
    getDaysInMonth(
      year,
      month,
    );

  const yearInput =
    document.getElementById(
      "yearInput",
    );

  const monthInput =
    document.getElementById(
      "monthInput",
    );

  const startDayInput =
    document.getElementById(
      "startDayInput",
    );

  const endDayInput =
    document.getElementById(
      "endDayInput",
    );

  if (yearInput) {
    yearInput.value =
      String(year);
  }

  if (monthInput) {
    monthInput.value =
      String(month);
  }

  if (startDayInput) {
    startDayInput.value =
      "1";
  }

  if (endDayInput) {
    endDayInput.value =
      String(daysInMonth);
  }
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
  const imported =
    await handleImport(
      event,
    );

  if (imported) {
    refreshAll();
  }
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

  setDefaultDateInputsToToday();

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
