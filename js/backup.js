"use strict";

import {
  DATA_VERSION,
  RETENTION_MONTHS,
} from "./config.js";

import {
  appData,
  resetRuntimeState,
  setAppData,
} from "./state.js";

import {
  deepClone,
  normalizeData,
  saveLocalData,
  createEmptyData,
} from "./data.js";

import {
  getFileDateString,
} from "./utils.js";

import {
  renderNameSettings,
} from "./settings.js";

import {
  renderLeaveList,
} from "./leave.js";

import {
  renderCalendar,
} from "./calendar.js";

import {
  renderEmptySummaries,
} from "./render.js";


export function getCurrentDataPayload() {
  return {
    version:
      DATA_VERSION,

    retentionMonths:
      RETENTION_MONTHS,

    baseline:
      deepClone(
        appData.baseline,
      ),

    names:
      deepClone(
        appData.names,
      ),

    history:
      deepClone(
        appData.history,
      ),

    leave:
      deepClone(
        appData.leave,
      ),
  };
}


export async function copyJsonToClipboard() {
  const json =
    JSON.stringify(
      getCurrentDataPayload(),
      null,
      2,
    );

  try {
    await navigator.clipboard.writeText(
      json,
    );

    return true;
  } catch (error) {
    const textarea =
      document.createElement(
        "textarea",
      );

    textarea.value =
      json;

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
      textarea.remove();

      return true;
    } catch (copyError) {
      console.error(
        copyError,
      );

      textarea.remove();

      return false;
    }
  }
}


export async function handleCopyJson() {
  const copied =
    await copyJsonToClipboard();

  const status =
    document.getElementById(
      "githubSaveStatus",
    );

  if (copied) {
    if (status) {
      status.textContent =
        "현재 데이터가 JSON으로 복사되었습니다.";

      status.classList.add(
        "success",
      );
    }

    alert(
      "JSON이 복사되었습니다.",
    );
  } else {
    alert(
      "JSON 복사에 실패했습니다.",
    );
  }
}


export function handleExport() {
  const json =
    JSON.stringify(
      getCurrentDataPayload(),
      null,
      2,
    );

  const blob =
    new Blob(
      [json],
      {
        type:
          "application/json",
      },
    );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;

  link.download =
    `assignment-history-${getFileDateString()}.json`;

  document.body.appendChild(link);

  link.click();

  link.remove();

  URL.revokeObjectURL(url);
}


export function handleImport(
  event,
) {
  const file =
    event.target.files?.[0];

  if (!file) {
    return;
  }

  const reader =
    new FileReader();

  reader.onload =
    () => {
      try {
        const parsed =
          JSON.parse(
            reader.result,
          );

        setAppData(
          normalizeData(parsed),
        );

        saveLocalData(appData);

        resetRuntimeState();

        renderNameSettings();
        renderLeaveList();
        renderEmptySummaries();
        renderCalendar();

        const result =
          document.getElementById(
            "resultText",
          );

        if (result) {
          result.textContent = "";
        }

        const status =
          document.getElementById(
            "statusText",
          );

        if (status) {
          status.textContent =
            "데이터를 복원했습니다.";

          status.classList.add(
            "success",
          );
        }

        alert(
          "데이터를 복원했습니다.",
        );
      } catch (error) {
        console.error(error);

        alert(
          "올바른 JSON 데이터가 아닙니다.",
        );
      } finally {
        event.target.value = "";
      }
    };

  reader.onerror =
    () => {
      alert(
        "파일을 읽지 못했습니다.",
      );

      event.target.value = "";
    };

  reader.readAsText(
    file,
    "utf-8",
  );
}


export function handleClearData() {
  const first =
    window.confirm(
      "모든 배정 기록, 누적 데이터, 연차 데이터를 삭제할까요?",
    );

  if (!first) {
    return false;
  }

  const second =
    window.confirm(
      "정말 전체 데이터를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.",
    );

  if (!second) {
    return false;
  }

  setAppData(
    createEmptyData(),
  );

  resetRuntimeState();

  saveLocalData(appData);

  renderNameSettings();
  renderLeaveList();
  renderEmptySummaries();
  renderCalendar();

  const result =
    document.getElementById(
      "resultText",
    );

  if (result) {
    result.textContent = "";
  }

  const status =
    document.getElementById(
      "statusText",
    );

  if (status) {
    status.textContent =
      "아직 생성되지 않았습니다.";

    status.classList.remove(
      "success",
    );
  }

  return true;
}
