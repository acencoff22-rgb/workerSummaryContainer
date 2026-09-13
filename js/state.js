"use strict";

import {
  createEmptyData,
  createEmptyGithubConfig,
} from "./data.js";


export let appData =
  createEmptyData();


export let githubConfig =
  createEmptyGithubConfig();


export let currentSchedule = [];


export let currentOriginalSchedule = [];


export let currentOriginalCounts = null;


export let copiedText = "";


export let calendarYear = 2026;


export let calendarMonth = 9;


export let selectedDetailDateKey = null;


export function setAppData(value) {
  appData = value;
}


export function setGithubConfig(value) {
  githubConfig = value;
}


export function setCurrentSchedule(value) {
  currentSchedule = value;
}


export function setCurrentOriginalSchedule(value) {
  currentOriginalSchedule = value;
}


export function setCurrentOriginalCounts(value) {
  currentOriginalCounts = value;
}


export function setCopiedText(value) {
  copiedText = value;
}


export function setCalendarYear(value) {
  calendarYear = value;
}


export function setCalendarMonth(value) {
  calendarMonth = value;
}


export function setSelectedDetailDateKey(value) {
  selectedDetailDateKey = value;
}


export function resetRuntimeState() {
  currentSchedule = [];
  currentOriginalSchedule = [];
  currentOriginalCounts = null;
  copiedText = "";
  selectedDetailDateKey = null;
}
