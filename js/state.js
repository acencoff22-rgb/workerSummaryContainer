"use strict";

import {
  createEmptyData,
  createEmptyGithubConfig,
} from "./data.js";


export let appData =
  createEmptyData();


export let githubConfig =
  createEmptyGithubConfig();


export let currentSchedule =
  [];


export let currentOriginalSchedule =
  [];


export let currentOriginalCounts =
  null;


export let copiedText =
  "";


export let calendarYear =
  2026;


export let calendarMonth =
  9;


export let selectedDetailDateKey =
  null;


export function setAppData(
  value,
) {
  appData = value;
}


export function setGithubConfig(
  value,
) {
  githubConfig = {
    ...createEmptyGithubConfig(),
    ...value,
  };
}


export function setCurrentSchedule(
  value,
) {
  currentSchedule = Array.isArray(
    value,
  )
    ? value
    : [];
}


export function setCurrentOriginalSchedule(
  value,
) {
  currentOriginalSchedule =
    Array.isArray(value)
      ? value
      : [];
}


export function setCurrentOriginalCounts(
  value,
) {
  currentOriginalCounts =
    value || null;
}


export function setCopiedText(
  value,
) {
  copiedText =
    String(value ?? "");
}


export function setCalendarYear(
  value,
) {
  calendarYear =
    Number(value);
}


export function setCalendarMonth(
  value,
) {
  calendarMonth =
    Number(value);
}


export function setSelectedDetailDateKey(
  value,
) {
  selectedDetailDateKey =
    value || null;
}


export function resetRuntimeState() {
  currentSchedule = [];
  currentOriginalSchedule = [];
  currentOriginalCounts = null;
  copiedText = "";
  selectedDetailDateKey = null;
}
