"use strict";

import {
  WORKERS,
} from "./config.js";

import {
  currentSchedule,
  currentOriginalSchedule,
} from "./state.js";

import {
  getLeaveWorkers,
} from "./leave.js";

import {
  getJobForWorker,
} from "./assignment.js";

import {
  getWorkerLabel,
  getJobLabel,
} from "./settings.js";

import {
  formatDateKey,
  escapeHtml,
} from "./utils.js";


function getScheduleTitle(
  schedule,
) {
  if (
    !schedule ||
    schedule.length === 0
  ) {
    return "업무 배정표";
  }

  return (
    `${schedule[0].year}년 ${schedule[0].month}월 업무 배정표`
  );
}


function createPrintableScheduleHtml() {
  if (
    !currentOriginalSchedule ||
    currentOriginalSchedule.length === 0
  ) {
    return null;
  }

  const title =
    getScheduleTitle(
      currentOriginalSchedule,
    );

  const rows = [];

  for (
    const day of currentOriginalSchedule
  ) {
    const dateKey =
      formatDateKey(
        day.year,
        day.month,
        day.day,
      );

    const actualDay =
      currentSchedule.find(
        (item) =>
          item.year === day.year &&
          item.month === day.month &&
          item.day === day.day,
      );

    const leaveWorkers =
      getLeaveWorkers(
        dateKey,
      );

    const workerRows =
      WORKERS.map(
        (worker) => {
          const job =
            actualDay
              ? getJobForWorker(
                  actualDay,
                  worker,
                )
              : null;

          const originalJob =
            getJobForWorker(
              day,
              worker,
            );

          const isLeave =
            leaveWorkers.includes(
              worker,
            );

          let displayedJob =
            job
              ? getJobLabel(job)
              : "미배정";

          if (isLeave) {
            displayedJob =
              originalJob
                ? `연차 (원래 ${getJobLabel(originalJob)})`
                : "연차";
          }

          return `
            <tr>
              <td>${escapeHtml(getWorkerLabel(worker))}</td>
              <td>${escapeHtml(displayedJob)}</td>
            </tr>
          `;
        },
      ).join("");

    rows.push(`
      <section class="print-day">
        <h2>${day.month}월 ${day.day}일</h2>

        <table>
          <thead>
            <tr>
              <th>작업자</th>
              <th>업무</th>
            </tr>
          </thead>

          <tbody>
            ${workerRows}
          </tbody>
        </table>
      </section>
    `);
  }

  return `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8">
      <title>${escapeHtml(title)}</title>

      <style>
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          padding: 24px;
          color: #111;
          background: #fff;
          font-family:
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            Roboto,
            "Noto Sans KR",
            sans-serif;
          line-height: 1.5;
        }

        h1 {
          margin: 0 0 24px;
          font-size: 24px;
        }

        .print-day {
          margin-bottom: 24px;
          break-inside: avoid;
        }

        .print-day h2 {
          margin: 0 0 8px;
          padding-bottom: 6px;
          border-bottom: 2px solid #111;
          font-size: 17px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        th,
        td {
          padding: 7px 8px;
          border: 1px solid #999;
          text-align: left;
          font-size: 13px;
        }

        th {
          background: #eee;
          font-weight: 700;
        }

        @media print {
          body {
            padding: 0;
          }

          .print-day {
            margin-bottom: 18px;
          }
        }
      </style>
    </head>

    <body>
      <h1>${escapeHtml(title)}</h1>
      ${rows.join("")}
    </body>
    </html>
  `;
}


function createPrintableCalendarHtml() {
  const calendar =
    document.getElementById(
      "calendarContainer",
    );

  if (
    !calendar ||
    !calendar.querySelector(".calendar")
  ) {
    return null;
  }

  const title =
    document.getElementById(
      "calendarTitle",
    )?.textContent ||
    "업무 배정표 달력";

  const calendarClone =
    calendar
      .querySelector(".calendar")
      .cloneNode(true);

  calendarClone
    .querySelectorAll(
      "[style]",
    )
    .forEach(
      (element) => {
        element.removeAttribute(
          "style",
        );
      },
    );

  return `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8">
      <title>${escapeHtml(title)}</title>

      <style>
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          padding: 10px;
          color: #111;
          background: #fff;
          font-family:
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            Roboto,
            "Noto Sans KR",
            sans-serif;
        }

        h1 {
          margin: 0 0 12px;
          font-size: 20px;
        }

        .calendar {
          display: grid;
          grid-template-columns:
            repeat(7, minmax(0, 1fr));
          border-top: 1px solid #777;
          border-left: 1px solid #777;
        }

        .calendar-weekday,
        .calendar-day {
          border-right: 1px solid #777;
          border-bottom: 1px solid #777;
        }

        .calendar-weekday {
          min-height: 28px;
          padding: 5px;
          text-align: center;
          font-size: 10px;
          font-weight: 700;
          background: #eee;
        }

        .calendar-day {
          min-height: 105px;
          padding: 4px;
        }

        .calendar-day.empty {
          background: #fafafa;
        }

        .calendar-date {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 3px;
          font-weight: 700;
          font-size: 11px;
        }

        .calendar-leave-label {
          font-size: 8px;
          color: #b00020;
        }

        .calendar-worker {
          display: grid;
          grid-template-columns: 24px minmax(0, 1fr);
          gap: 3px;
          font-size: 8px;
        }

        .calendar-worker-name {
          font-weight: 700;
          overflow: hidden;
        }

        .calendar-worker-job {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .calendar-worker-job.leave {
          color: #b00020;
        }

        @page {
          size: A4 landscape;
          margin: 8mm;
        }
      </style>
    </head>

    <body>
      <h1>${escapeHtml(title)}</h1>

      ${calendarClone.outerHTML}
    </body>
    </html>
  `;
}


function openPrintWindow(
  html,
) {
  const printWindow =
    window.open(
      "",
      "_blank",
      "noopener,noreferrer",
    );

  if (!printWindow) {
    alert(
      "출력 창을 열 수 없습니다. 브라우저의 팝업 차단을 확인해주세요.",
    );

    return false;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.focus();

  window.setTimeout(
    () => {
      printWindow.print();
    },
    300,
  );

  return true;
}


export function handlePrintSchedule() {
  const html =
    createPrintableScheduleHtml();

  if (!html) {
    alert(
      "먼저 배정표를 생성해주세요.",
    );

    return false;
  }

  return openPrintWindow(html);
}


export function handlePrintCalendar() {
  const html =
    createPrintableCalendarHtml();

  if (!html) {
    alert(
      "먼저 배정표를 생성해주세요.",
    );

    return false;
  }

  return openPrintWindow(html);
}
