"use strict";

import {
  THEME_KEY,
} from "./config.js";


export function updateThemeButton() {
  const button =
    document.getElementById(
      "themeToggle",
    );

  if (!button) {
    return;
  }

  const dark =
    document.body.classList.contains(
      "dark",
    );

  button.textContent =
    dark
      ? "라이트모드"
      : "다크모드";

  button.setAttribute(
    "aria-label",
    dark
      ? "라이트모드로 변경"
      : "다크모드로 변경",
  );
}


export function restoreTheme() {
  const theme =
    localStorage.getItem(
      THEME_KEY,
    );

  document.body.classList.toggle(
    "dark",
    theme === "dark",
  );

  updateThemeButton();
}


export function handleThemeToggle() {
  document.body.classList.toggle(
    "dark",
  );

  const dark =
    document.body.classList.contains(
      "dark",
    );

  localStorage.setItem(
    THEME_KEY,
    dark
      ? "dark"
      : "light",
  );

  updateThemeButton();
}
