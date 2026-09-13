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
    !Array.isArray(schedule) ||
    schedule.length === 0
  ) {
    return "업무 배정표";
  }

  const first =
    schedule[0];

  return (
    `${first.year}년 ${first.month}월 업무 배정표`
  );
}


function createPrintableScheduleHtml() {
  if (
    !Array.isArray(
      currentOriginalSchedule,
    ) ||
    currentOriginalSchedule.length === 0
  ) {
    return null;
  }

  const title =
    getScheduleTitle(
      currentOriginalSchedule,
    );

  const sections = [];

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
          const actualJob =
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
            actualJob
              ? getJobLabel(actualJob)
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

    sections.push(`
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

        html,
        body {
          margin: 0;
          padding: 0;
        }

        body {
          padding: 20px;
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
          margin: 0 0 20px;
          font-size: 24px;
        }

        .print-day {
          margin-bottom: 20px;
          break-inside: avoid;
        }

        .print-day h2 {
          margin: 0 0 7px;
          padding-bottom: 5px;
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
          border: 1px solid #888;
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
            margin-bottom: 14px;
          }
        }

        @page {
          size: A4 portrait;
          margin: 10mm;
        }
      </style>
    </head>

    <body>
      <h1>${escapeHtml(title)}</h1>

      ${sections.join("")}
    </body>
    </html>
  `;
}


function createPrintableCalendarHtml() {
  const container =
    document.getElementById(
      "calendarContainer",
    );

  const calendar =
    container?.querySelector(
      ".calendar",
    );

  if (!calendar) {
    return null;
  }

  const title =
    document.getElementById(
      "calendarTitle",
    )?.textContent ||
    "업무 배정표 달력";

  const calendarClone =
    calendar.cloneNode(true);

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

        html,
        body {
          margin: 0;
          padding: 0;
        }

        body {
          padding: 8px;
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
          margin: 0 0 10px;
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
          min-height: 27px;
          padding: 4px;
          text-align: center;
          font-size: 10px;
          font-weight: 700;
          background: #eee;
        }

        .calendar-day {
          min-height: 105px;
          padding: 4px;
          background: #fff;
          cursor: default;
        }

        .calendar-day.empty {
          background: #fafafa;
        }

        .calendar-date {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 5px;
          margin-bottom: 3px;
        }

        .calendar-date-number {
          font-weight: 700;
          font-size: 11px;
        }

        .calendar-leave-label {
          padding: 1px 4px;
          font-size: 8px;
          color: #a00018;
        }

        .calendar-assignment {
          display: grid;
          gap: 1px;
        }

        .calendar-worker {
          display: grid;
          grid-template-columns:
            24px minmax(0, 1fr);
          gap: 3px;
          font-size: 8px;
        }

        .calendar-worker-name {
          min-width: 0;
          font-weight: 700;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .calendar-worker-job {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .calendar-worker-job.leave {
          color: #a00018;
        }

        @page {
          size: A4 landscape;
          margin: 7mm;
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
  /*
   * 먼저 빈 창을 열고,
   * 확보한 window 객체에 내용을 작성한다.
   *
   * 이렇게 하면 일부 브라우저에서
   * noopener 관련 동작으로 인해
   * 새 창이 null로 반환되는 문제를 피할 수 있다.
   */
  const printWindow =
    window.open(
      "",
      "_blank",
    );

  if (!printWindow) {
    alert(
      "출력 창을 열 수 없습니다. 브라우저의 팝업 차단을 확인해주세요.",
    );

    return false;
  }

  try {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    const printAndClose =
      () => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch (error) {
          console.error(
            "인쇄 실행 실패:",
            error,
          );
        }
      };

    /*
     * 외부 리소스가 없는 자체 HTML이므로
     * 짧은 지연 후 인쇄한다.
     */
    printWindow.setTimeout(
      printAndClose,
      300,
    );

    return true;
  } catch (error) {
    console.error(
      "출력 화면 생성 실패:",
      error,
    );

    try {
      printWindow.close();
    } catch (closeError) {
      console.error(
        closeError,
      );
    }

    alert(
      "출력 화면을 만들지 못했습니다.",
    );

    return false;
  }
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

  return openPrintWindow(
    html,
  );
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

  return openPrintWindow(
    html,
  );
}
