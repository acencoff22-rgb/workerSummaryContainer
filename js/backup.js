"use strict";

import {
  DATA_VERSION,
  RETENTION_MONTHS,
} from "./config.js";

import {
  appData,
  setAppData,
  resetRuntimeState,
} from "./state.js";

import {
  createEmptyData,
  normalizeData,
  saveLocalData,
  deepClone,
} from "./data.js";

import {
  getFileDateString,
} from "./utils.js";


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


function fallbackCopyText(
  text,
) {
  const textarea =
    document.createElement(
      "textarea",
    );

  textarea.value =
    text;

  textarea.style.position =
    "fixed";

  textarea.style.left =
    "-9999px";

  textarea.style.top =
    "0";

  textarea.style.opacity =
    "0";

  document.body.appendChild(
    textarea,
  );

  textarea.focus();
  textarea.select();

  let copied = false;

  try {
    copied =
      document.execCommand(
        "copy",
      );
  } catch (error) {
    console.error(
      "클립보드 fallback 실패:",
      error,
    );
  }

  textarea.remove();

  return copied;
}


export async function copyTextToClipboard(
  text,
) {
  const value =
    String(text ?? "");

  if (!value) {
    return false;
  }

  if (
    navigator.clipboard &&
    typeof navigator.clipboard.writeText ===
      "function"
  ) {
    try {
      await navigator.clipboard.writeText(
        value,
      );

      return true;
    } catch (error) {
      console.warn(
        "navigator.clipboard 실패. fallback을 사용합니다.",
        error,
      );
    }
  }

  return fallbackCopyText(
    value,
  );
}


export async function copyJsonToClipboard() {
  const json =
    JSON.stringify(
      getCurrentDataPayload(),
      null,
      2,
    );

  return copyTextToClipboard(
    json,
  );
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

    return true;
  }

  if (status) {
    status.textContent =
      "JSON 복사에 실패했습니다.";

    status.classList.remove(
      "success",
    );
  }

  alert(
    "JSON 복사에 실패했습니다.",
  );

  return false;
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
          "application/json;charset=utf-8",
      },
    );

  const url =
    URL.createObjectURL(
      blob,
    );

  const link =
    document.createElement(
      "a",
    );

  link.href =
    url;

  link.download =
    `assignment-history-${getFileDateString()}.json`;

  document.body.appendChild(
    link,
  );

  link.click();

  link.remove();

  window.setTimeout(
    () => {
      URL.revokeObjectURL(
        url,
      );
    },
    0,
  );
}


export function handleImport(
  event,
) {
  const input =
    event?.target;

  const file =
    input?.files?.[0];

  if (!file) {
    return Promise.resolve(
      false,
    );
  }

  return new Promise(
    (resolve) => {
      const reader =
        new FileReader();

      reader.onload =
        () => {
          let imported = false;

          try {
            const text =
              String(
                reader.result ??
                  "",
              );

            const parsed =
              JSON.parse(text);

            const normalized =
              normalizeData(
                parsed,
              );

            setAppData(
              normalized,
            );

            saveLocalData(
              normalized,
            );

            resetRuntimeState();

            alert(
              "데이터를 복원했습니다.",
            );

            imported = true;
          } catch (error) {
            console.error(
              "JSON 복원 실패:",
              error,
            );

            alert(
              "올바른 JSON 데이터가 아닙니다.",
            );
          } finally {
            if (input) {
              input.value = "";
            }

            resolve(imported);
          }
        };

      reader.onerror =
        () => {
          alert(
            "파일을 읽지 못했습니다.",
          );

          if (input) {
            input.value = "";
          }

          resolve(false);
        };

      reader.readAsText(
        file,
        "utf-8",
      );
    },
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

  const emptyData =
    createEmptyData();

  setAppData(
    emptyData,
  );

  resetRuntimeState();

  saveLocalData(
    emptyData,
  );

  return true;
}
