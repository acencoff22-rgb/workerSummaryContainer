"use strict";


export function getDateInfo(
  year,
  month,
  day,
) {
  const date =
    new Date(
      year,
      month - 1,
      day,
    );

  return {
    year:
      date.getFullYear(),

    month:
      date.getMonth() + 1,

    day:
      date.getDate(),

    weekday:
      date.getDay(),
  };
}


export function getDaysInMonth(
  year,
  month,
) {
  return new Date(
    year,
    month,
    0,
  ).getDate();
}


export function formatDateKey(
  year,
  month,
  day,
) {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}


export function getMonthKey(
  year,
  month,
) {
  return (
    `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`
  );
}


export function parseMonthKey(key) {
  const match =
    /^(\d{4})-(\d{2})$/.exec(
      key,
    );

  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
  };
}


export function addMonths(
  year,
  month,
  offset,
) {
  const date =
    new Date(
      year,
      month - 1 + offset,
      1,
    );

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
}


export function getRollingMonthKeys(
  year,
  month,
  retentionMonths,
) {
  const result = [];

  for (
    let offset = -(retentionMonths - 1);
    offset <= 0;
    offset += 1
  ) {
    const date =
      addMonths(
        year,
        month,
        offset,
      );

    result.push(
      getMonthKey(
        date.year,
        date.month,
      ),
    );
  }

  return result;
}


export function getWeekdayName(
  weekday,
) {
  const names = [
    "일",
    "월",
    "화",
    "수",
    "목",
    "금",
    "토",
  ];

  return (
    names[weekday] ?? ""
  );
}


export function formatDisplayDate(
  dateKey,
) {
  const date =
    new Date(
      `${dateKey}T00:00:00`,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return dateKey;
  }

  return (
    `${date.getFullYear()}년 ` +
    `${date.getMonth() + 1}월 ` +
    `${date.getDate()}일 ` +
    `(${getWeekdayName(date.getDay())})`
  );
}


export function getFileDateString() {
  const date = new Date();

  return [
    date.getFullYear(),
    String(
      date.getMonth() + 1,
    ).padStart(2, "0"),
    String(
      date.getDate(),
    ).padStart(2, "0"),
  ].join("");
}


export function escapeHtml(
  value,
) {
  return String(
    value ?? "",
  )
    .replaceAll(
      "&",
      "&amp;",
    )
    .replaceAll(
      "<",
      "&lt;",
    )
    .replaceAll(
      ">",
      "&gt;",
    )
    .replaceAll(
      '"',
      "&quot;",
    )
    .replaceAll(
      "'",
      "&#039;",
    );
}


export function getRange(
  values,
) {
  if (
    !Array.isArray(values) ||
    values.length === 0
  ) {
    return 0;
  }

  return (
    Math.max(...values) -
    Math.min(...values)
  );
}


export function generatePermutations(
  items,
) {
  if (
    items.length <= 1
  ) {
    return [
      items.slice(),
    ];
  }

  const result = [];

  for (
    let i = 0;
    i < items.length;
    i += 1
  ) {
    const current =
      items[i];

    const remaining = [
      ...items.slice(
        0,
        i,
      ),
      ...items.slice(
        i + 1,
      ),
    ];

    const children =
      generatePermutations(
        remaining,
      );

    for (
      const child of children
    ) {
      result.push([
        current,
        ...child,
      ]);
    }
  }

  return result;
}
