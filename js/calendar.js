"use strict";

import {
  WORKERS,
} from "./config.js";

import {
  appData,
  currentSchedule,
  currentOriginalSchedule,
  selectedDetailDateKey,
  calendarYear,
  calendarMonth,
  setCalendarYear,
  setCalendarMonth,
  setSelectedDetailDateKey,
} from "./state.js";

import {
  getDaysInMonth,
  formatDateKey,
  getDateInfo,
  getWeekdayName,
  escapeHtml,
} from "./utils.js";

import {
  getWorkerLabel,
  getJobLabel,
} from "./settings.js";

import {
  getLeaveWorkers,
  loadLeaveCheckboxes,
} from "./leave.js";

import {
  getJobForWorker,
} from "./assignment.js";


export function renderCalendar() {
  const container =
    document.getElementById(
      "calendarContainer",
    );

  const title =
    document.getElementById(
      "calendarTitle",
    );

  if (
    !container ||
    !title
  ) {
    return;
  }

  title.textContent =
    `${calendarYear}년 ${calendarMonth}월`;

  if (
    currentOriginalSchedule.length === 0
  ) {
    container.innerHTML = `
      <div class="empty-state">
        ${calendarYear}년 ${calendarMonth}월 배정표를 생성하면 달력에 표시됩니다.
      </div>
    `;

    return;
  }

  const scheduleMap =
    new Map();

  for (
    const day of currentSchedule
  ) {
    const key =
      formatDateKey(
        day.year,
        day.month,
        day.day,
      );

    scheduleMap.set(
      key,
      day,
    );
  }

  const firstDate =
    new Date(
      calendarYear,
      calendarMonth - 1,
      1,
    );

  const firstWeekday =
    firstDate.getDay();

  const daysInMonth =
    getDaysInMonth(
      calendarYear,
      calendarMonth,
    );

  const calendar =
    document.createElement(
      "div",
    );

  calendar.className =
    "calendar";

  const weekdays = [
    "일",
    "월",
    "화",
    "수",
    "목",
    "금",
    "토",
  ];

  weekdays.forEach(
    (
      weekday,
      index,
    ) => {
      const header =
        document.createElement(
          "div",
        );

      header.className =
        "calendar-weekday";

      header.textContent =
        weekday;

      if (index === 0) {
        header.classList.add(
          "sunday",
        );
      }

      if (index === 6) {
        header.classList.add(
          "saturday",
        );
      }

      calendar.appendChild(
        header,
      );
    },
  );

  for (
    let index = 0;
    index < firstWeekday;
    index += 1
  ) {
    const empty =
      document.createElement(
        "div",
      );

    empty.className =
      "calendar-day empty";

    calendar.appendChild(
      empty,
    );
  }

  const today =
    new Date();

  for (
    let dayNumber = 1;
    dayNumber <= daysInMonth;
    dayNumber += 1
  ) {
    const key =
      formatDateKey(
        calendarYear,
        calendarMonth,
        dayNumber,
      );

    const actualDay =
      scheduleMap.get(key);

    const cell =
      document.createElement(
        "div",
      );

    cell.className =
      "calendar-day";

    const weekday =
      new Date(
        calendarYear,
        calendarMonth - 1,
        dayNumber,
      ).getDay();

    if (
      weekday === 0 ||
      weekday === 6
    ) {
      cell.classList.add(
        "weekend",
      );
    }

    if (
      today.getFullYear() ===
        calendarYear &&
      today.getMonth() + 1 ===
        calendarMonth &&
      today.getDate() ===
        dayNumber
    ) {
      cell.classList.add(
        "today",
      );
    }

    const leaveWorkers =
      actualDay?.leaveWorkers ||
      getLeaveWorkers(key);

    if (
      leaveWorkers.length > 0
    ) {
      cell.classList.add(
        "leave",
      );
    }

    const dateHeader =
      document.createElement(
        "div",
      );

    dateHeader.className =
      "calendar-date";

    const dateNumber =
      document.createElement(
        "span",
      );

    dateNumber.className =
      "calendar-date-number";

    dateNumber.textContent =
      String(dayNumber);

    dateHeader.appendChild(
      dateNumber,
    );

    if (
      leaveWorkers.length > 0
    ) {
      const leaveLabel =
        document.createElement(
          "span",
        );

      leaveLabel.className =
        "calendar-leave-label";

      leaveLabel.textContent =
        "연차";

      dateHeader.appendChild(
        leaveLabel,
      );
    }

    cell.appendChild(
      dateHeader,
    );

    const assignment =
      document.createElement(
        "div",
      );

    assignment.className =
      "calendar-assignment";

    if (actualDay) {
      for (
        const worker of WORKERS
      ) {
        const row =
          document.createElement(
            "div",
          );

        row.className =
          "calendar-worker";

        const name =
          document.createElement(
            "span",
          );

        name.className =
          "calendar-worker-name";

        name.textContent =
          getWorkerLabel(worker);

        const jobElement =
          document.createElement(
            "span",
          );

        jobElement.className =
          "calendar-worker-job";

        if (
          leaveWorkers.includes(
            worker,
          )
        ) {
          jobElement.textContent =
            "연차";

          jobElement.classList.add(
            "leave",
          );
        } else {
          const job =
            getJobForWorker(
              actualDay,
              worker,
            );

          jobElement.textContent =
            job
              ? getJobLabel(job)
              : "미배정";
        }

        row.appendChild(name);
        row.appendChild(
          jobElement,
        );

        assignment.appendChild(
          row,
        );
      }
    } else {
      const message =
        document.createElement(
          "div",
        );

      message.className =
        "calendar-worker-job";

      message.textContent =
        "미생성";

      assignment.appendChild(
        message,
      );
    }

    cell.appendChild(
      assignment,
    );

    cell.addEventListener(
      "click",
      () => {
        openDayDetail(
          key,
          true,
        );
      },
    );

    calendar.appendChild(
      cell,
    );
  }

  const totalCells =
    firstWeekday +
    daysInMonth;

  const remainder =
    totalCells % 7;

  if (
    remainder !== 0
  ) {
    for (
      let index = remainder;
      index < 7;
      index += 1
    ) {
      const empty =
        document.createElement(
          "div",
        );

      empty.className =
        "calendar-day empty";

      calendar.appendChild(
        empty,
      );
    }
  }

  container.innerHTML = "";
  container.appendChild(
    calendar,
  );
}


export function createDetailAssignmentHtml(
  actualDay,
  originalDay,
  leaveWorkers,
) {
  if (!originalDay) {
    return `
      <div class="detail-note">
        아직 이 날짜의 배정표가 생성되지 않았습니다.
      </div>
    `;
  }

  const rows = [];

  for (
    const worker of WORKERS
  ) {
    const originalJob =
      getJobForWorker(
        originalDay,
        worker,
      );

    const actualJob =
      actualDay
        ? getJobForWorker(
            actualDay,
            worker,
          )
        : null;

    let jobText =
      actualJob
        ? getJobLabel(actualJob)
        : "미배정";

    let className =
      "detail-job";

    if (
      leaveWorkers.includes(
        worker,
      )
    ) {
      jobText =
        originalJob
          ? `연차 (원래 ${getJobLabel(originalJob)})`
          : "연차";

      className +=
        " leave";
    }

    rows.push(`
      <div class="detail-row">
        <span class="detail-worker">
          ${escapeHtml(getWorkerLabel(worker))}
        </span>

        <span class="${className}">
          ${escapeHtml(jobText)}
        </span>
      </div>
    `);
  }

  return `
    <div class="detail-section">

      <h3 class="detail-section-title">
        당일 배정
      </h3>

      <div class="detail-list">
        ${rows.join("")}
      </div>

    </div>
  `;
}


export function openDayDetail(
  dateKey,
  scrollToLeave = false,
) {
  setSelectedDetailDateKey(
    dateKey,
  );

  const modal =
    document.getElementById(
      "dayDetailModal",
    );

  const title =
    document.getElementById(
      "dayDetailTitle",
    );

  const body =
    document.getElementById(
      "dayDetailBody",
    );

  if (
    !modal ||
    !title ||
    !body
  ) {
    return;
  }

  const dateParts =
    dateKey
      .split("-")
      .map(Number);

  const year = dateParts[0];
  const month = dateParts[1];
  const day = dateParts[2];

  const dateInfo =
    getDateInfo(
      year,
      month,
      day,
    );

  title.textContent =
    `${year}년 ${month}월 ${day}일 (${getWeekdayName(dateInfo.weekday)})`;

  const actualDay =
    currentSchedule.find(
      (item) =>
        item.year === year &&
        item.month === month &&
        item.day === day,
    );

  const originalDay =
    currentOriginalSchedule.find(
      (item) =>
        item.year === year &&
        item.month === month &&
        item.day === day,
    );

  const leaveWorkers =
    getLeaveWorkers(
      dateKey,
    );

  const parts = [];

  parts.push(
    createDetailAssignmentHtml(
      actualDay,
      originalDay,
      leaveWorkers,
    ),
  );

  if (
    leaveWorkers.length > 0
  ) {
    parts.push(`
      <div class="detail-section">
        <h3 class="detail-section-title">
          연차자
        </h3>

        <div class="leave-detail-list">
          ${leaveWorkers
            .map(
              (worker) =>
                `<span class="leave-badge active">${escapeHtml(getWorkerLabel(worker))}</span>`,
            )
            .join("")}
        </div>
      </div>
    `);
  } else {
    parts.push(`
      <div class="detail-section">
        <h3 class="detail-section-title">
          연차
        </h3>

        <div class="detail-note">
          연차자가 없습니다.
        </div>
      </div>
    `);
  }

  body.innerHTML =
    parts.join("");

  modal.hidden = false;

  document.body.classList.add(
    "modal-open",
  );

  if (scrollToLeave) {
    const input =
      document.getElementById(
        "leaveDateInput",
      );

    if (input) {
      input.value = dateKey;
      loadLeaveCheckboxes(
        dateKey,
      );
    }
  }
}


export function closeDayDetail() {
  const modal =
    document.getElementById(
      "dayDetailModal",
    );

  if (modal) {
    modal.hidden = true;
  }

  document.body.classList.remove(
    "modal-open",
  );

  setSelectedDetailDateKey(
    null,
  );
}


export function handleDayDetailLeave() {
  if (
    !selectedDetailDateKey
  ) {
    return;
  }

  const input =
    document.getElementById(
      "leaveDateInput",
    );

  if (!input) {
    return;
  }

  input.value =
    selectedDetailDateKey;

  loadLeaveCheckboxes(
    selectedDetailDateKey,
  );

  closeDayDetail();

  input.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
}


export function moveCalendarMonth(
  offset,
) {
  const date =
    new Date(
      calendarYear,
      calendarMonth - 1 + offset,
      1,
    );

  setCalendarYear(
    date.getFullYear(),
  );

  setCalendarMonth(
    date.getMonth() + 1,
  );

  renderCalendar();
}


export function updateCalendarToGeneratedMonth() {
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

  if (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12
  ) {
    setCalendarYear(year);
    setCalendarMonth(month);
  }
}
