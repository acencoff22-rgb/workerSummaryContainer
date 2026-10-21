"use strict";

export const STORAGE_KEY =
  "assignment-app-data-v6";

export const GITHUB_CONFIG_KEY =
  "assignment-app-github-config-v1";

export const THEME_KEY =
  "assignment-app-theme";

export const DATA_VERSION = 7;

export const RETENTION_MONTHS = 6;

export const BEAM_WIDTH = 3000;

export const MAX_STATES_PER_SIGNATURE = 2;


export const DEFAULT_WORKERS = [
  "김",
  "탁",
  "임",
  "박",
  "류",
];


export const DEFAULT_JOBS = [
  "볼분리",
  "볼분리 보조",
  "설거지 및 성형보조",
  "분쇄 및 성형보조",
  "성형 및 분쇄보조",
];

export const WORKERS = [...DEFAULT_WORKERS];
export const JOBS = [...DEFAULT_JOBS];

export function setRoster(workers, jobs) {
  WORKERS.splice(0, WORKERS.length, ...workers);
  JOBS.splice(0, JOBS.length, ...jobs);
}

try {
  if (typeof localStorage !== "undefined") {
    const saved = JSON.parse(localStorage.getItem("assignment-app-roster-v1") || "null");
    if (Array.isArray(saved?.workers) && saved.workers.length && Array.isArray(saved?.jobs) && saved.jobs.length) {
      setRoster(saved.workers, saved.jobs);
    }
  }
} catch (error) {
  console.warn("작업자·업무 명단을 읽지 못했습니다.", error);
}


export const MAIN_WORKERS = [
  "김",
  "탁",
  "임",
];


export const LIU_JOBS = [
  "설거지 및 성형보조",
  "분쇄 및 성형보조",
  "성형 및 분쇄보조",
];


export const PARK_ALLOWED_JOBS = [
  "설거지 및 성형보조",
  "분쇄 및 성형보조",
];
