"use strict";

import {
  WORKERS,
  JOBS,
} from "./config.js";

import {
  currentOriginalSchedule,
  currentOriginalCounts,
  currentSchedule,
  setCopiedText,
} from "./state.js";

import {
  createEmptyJobCounts,
  createEmptyWorkerCounts,
  addWorkerCounts,
} from "./data.js";

import {
  validateOriginalSchedule,
  getJobForWorker,
  getStartingCountsForMonth,
} from "./assignment.js";

import {
  getWorkerLabel,
  getJobLabel,
} from "./settings.js";

import {
  getLeaveWorkers,
} from "./leave.js";

import {
  formatDateKey,
} from "./utils.js";

import {
  renderCalendar,
} from "./calendar.js";


export function formatScheduleAsText(
  schedule,
) {
  if (
    !Array.isArray(schedule) ||
    schedule.length === 0
  ) {
    return "";
  }

  const first =
    schedule[0];

  const lines = [];

  lines.push(
    `${first.year}년 ${first.month}월 업무 배정표`,
  );

  lines.push("");

  for (
    const day of schedule
  ) {
    const dateKey =
      formatDateKey(
        day.year,
        day.month,
        day.day,
      );

    const leaveWorkers =
      getLeaveWorkers(
        dateKey,
      );

    lines.push(
      `${day.month}월 ${day.day}일`,
    );

    for (
      const worker of WORKERS
    ) {
      const originalJob =
        getJobForWorker(
          day,
          worker,
        );

      if (
        leaveWorkers.includes(
          worker,
        )
      ) {
        lines.push(
          `${getWorkerLabel(worker)} → 연차${
            originalJob
              ? ` (원래 ${getJobLabel(originalJob)})`
              : ""
          }`,
        );

        continue;
      }

      lines.push(
        `${getWorkerLabel(worker)} → ${
          originalJob
            ? getJobLabel(originalJob)
            : "미배정"
        }`,
      );
    }

    lines.push("");
  }

  return lines.join("\n");
}


export function renderSchedule() {
  const result =
    document.getElementById(
      "resultText",
    );

  const status =
    document.getElementById(
      "statusText",
    );

  const errors =
    validateOriginalSchedule(
      currentOriginalSchedule,
      getWorkerLabel,
      getJobLabel,
    );

  const text =
    formatScheduleAsText(
      currentSchedule,
    );

  setCopiedText(text);

  if (result) {
    result.textContent =
      text;

    if (
      errors.length > 0
    ) {
      result.textContent +=
        "\n\n[검증 오류]\n" +
        errors.join("\n");
    }
  }

  if (status) {
    if (
      errors.length === 0 &&
      currentOriginalSchedule.length > 0
    ) {
      status.textContent =
        `${currentOriginalSchedule.length}일 생성 완료 · 월 전체 최적화 · 규칙 검증 통과`;

      status.classList.add(
        "success",
      );
    } else if (
      currentOriginalSchedule.length === 0
    ) {
      status.textContent =
        "아직 생성되지 않았습니다.";

      status.classList.remove(
        "success",
      );
    } else {
      status.textContent =
        `검증 오류 ${errors.length}건`;

      status.classList.remove(
        "success",
      );
    }
  }

  renderJobSummary();
  renderWorkerSummary();
  renderCalendar();
}


export function renderJobSummary() {
  const container =
    document.getElementById(
      "summaryContainer",
    );

  if (!container) {
    return;
  }

  if (
    currentOriginalSchedule.length === 0
  ) {
    container.innerHTML = `
      <div class="empty-state">
        배정표를 생성하면 횟수가 표시됩니다.
      </div>
    `;

    return;
  }

  const counts =
    createEmptyJobCounts();

  for (
    const day of currentOriginalSchedule
  ) {
    for (
      const job of JOBS
    ) {
      if (day?.[job]) {
        counts[job] += 1;
      }
    }
  }

  container.innerHTML = "";

  for (
    const job of JOBS
  ) {
    const card =
      document.createElement(
        "div",
      );

    card.className =
      "summary-card";

    const label =
      document.createElement(
        "span",
      );

    label.className =
      "label";

    label.textContent =
      getJobLabel(job);

    const value =
      document.createElement(
        "span",
      );

    value.className =
      "value";

    value.textContent =
      `${counts[job]}회`;

    card.appendChild(label);
    card.appendChild(value);

    container.appendChild(card);
  }
}


export function renderWorkerSummary() {
  const container =
    document.getElementById(
      "workerSummaryContainer",
    );

  if (!container) {
    return;
  }

  if (
    currentOriginalSchedule.length === 0
  ) {
    container.innerHTML = `
      <div class="empty-state">
        배정표를 생성하면 작업자별 횟수가 표시됩니다.
      </div>
    `;

    return;
  }

  /*
   * "최근 6개월 상세 이력과 이전 기간 압축 누적값을
   * 함께 반영합니다" 안내 문구대로,
   * baseline + 최근 6개월 history + 이번 달 생성분을
   * 모두 합산해서 보여준다.
   *
   * (예전에는 이번 달 생성분만 표시되고 있었다.)
   */
  const first =
    currentOriginalSchedule[0];

  const startingCounts =
    first
      ? getStartingCountsForMonth(
          first.year,
          first.month,
        )
      : createEmptyWorkerCounts();

  const counts =
    addWorkerCounts(
      startingCounts,
      currentOriginalCounts ||
        createEmptyWorkerCounts(),
    );

  const wrapper =
    document.createElement(
      "div",
    );

  wrapper.className =
    "worker-table-wrap";

  const table =
    document.createElement(
      "table",
    );

  table.className =
    "worker-table";

  const thead =
    document.createElement(
      "thead",
    );

  const header =
    document.createElement(
      "tr",
    );

  const headers = [
    "작업자",
    ...JOBS.map(
      getJobLabel,
    ),
    "총합",
  ];

  for (
    const text of headers
  ) {
    const th =
      document.createElement(
        "th",
      );

    th.textContent =
      text;

    header.appendChild(th);
  }

  thead.appendChild(header);

  const tbody =
    document.createElement(
      "tbody",
    );

  for (
    const worker of WORKERS
  ) {
    const row =
      document.createElement(
        "tr",
      );

    const values = [
      getWorkerLabel(worker),

      ...JOBS.map(
        (job) =>
          counts[worker][job],
      ),
    ];

    const total =
      values
        .slice(1)
        .reduce(
          (sum, value) =>
            sum + Number(value || 0),
          0,
        );

    values.push(total);

    values.forEach(
      (
        value,
        index,
      ) => {
        const td =
          document.createElement(
            "td",
          );

        if (
          index ===
          values.length - 1
        ) {
          const strong =
            document.createElement(
              "strong",
            );

          strong.textContent =
            String(value);

          td.appendChild(
            strong,
          );
        } else {
          td.textContent =
            String(value);
        }

        row.appendChild(td);
      },
    );

    tbody.appendChild(row);
  }

  table.appendChild(thead);
  table.appendChild(tbody);

  wrapper.appendChild(table);

  container.innerHTML = "";
  container.appendChild(wrapper);
}


export function renderEmptySummaries() {
  const summary =
    document.getElementById(
      "summaryContainer",
    );

  if (summary) {
    summary.innerHTML = `
      <div class="empty-state">
        배정표를 생성하면 횟수가 표시됩니다.
      </div>
    `;
  }

  const workers =
    document.getElementById(
      "workerSummaryContainer",
    );

  if (workers) {
    workers.innerHTML = `
      <div class="empty-state">
        배정표를 생성하면 작업자별 횟수가 표시됩니다.
      </div>
    `;
  }
}
