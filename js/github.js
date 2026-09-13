"use strict";

import {
  githubConfig,
  setGithubConfig,
  setAppData,
} from "./state.js";

import {
  createEmptyGithubConfig,
  normalizeData,
  loadGithubConfig,
  saveGithubConfig,
  saveLocalData,
} from "./data.js";

import {
  copyJsonToClipboard,
} from "./backup.js";


export function initializeGithubConfig() {
  setGithubConfig(
    loadGithubConfig(),
  );
}


export function readGithubInputs() {
  const owner =
    document.getElementById(
      "githubOwnerInput",
    )?.value.trim();

  const repo =
    document.getElementById(
      "githubRepoInput",
    )?.value.trim();

  const branch =
    document.getElementById(
      "githubBranchInput",
    )?.value.trim() ||
    "main";

  const dataPath =
    document.getElementById(
      "githubDataPathInput",
    )?.value.trim() ||
    "data/history.json";

  if (!owner) {
    throw new Error(
      "GitHub 사용자명을 입력해주세요.",
    );
  }

  if (!repo) {
    throw new Error(
      "GitHub 저장소명을 입력해주세요.",
    );
  }

  return {
    owner,
    repo,
    branch,
    dataPath:
      dataPath.replace(
        /^\/+/,
        "",
      ),
  };
}


export function updateGithubForm() {
  const fields = {
    githubOwnerInput:
      githubConfig.owner,

    githubRepoInput:
      githubConfig.repo,

    githubBranchInput:
      githubConfig.branch,

    githubDataPathInput:
      githubConfig.dataPath,
  };

  for (
    const [
      id,
      value,
    ] of Object.entries(fields)
  ) {
    const element =
      document.getElementById(id);

    if (element) {
      element.value =
        value ?? "";
    }
  }
}


export function updateGithubConfigStatus() {
  const element =
    document.getElementById(
      "githubConfigStatus",
    );

  if (!element) {
    return;
  }

  if (
    !githubConfig.owner ||
    !githubConfig.repo
  ) {
    element.textContent =
      "GitHub 저장소가 설정되지 않았습니다.";

    element.classList.remove(
      "success",
    );

    return;
  }

  element.textContent =
    `저장소: ${githubConfig.owner}/${githubConfig.repo}\n` +
    `브랜치: ${githubConfig.branch}\n` +
    `데이터: ${githubConfig.dataPath}`;

  element.classList.add(
    "success",
  );
}


export function applyGithubConfig(
  config,
) {
  const nextConfig = {
    ...createEmptyGithubConfig(),
    ...config,
  };

  setGithubConfig(
    nextConfig,
  );

  saveGithubConfig(
    nextConfig,
  );

  updateGithubForm();
  updateGithubConfigStatus();
}


export function getGithubRawUrl() {
  if (
    !githubConfig.owner ||
    !githubConfig.repo
  ) {
    return null;
  }

  const path =
    githubConfig.dataPath
      .split("/")
      .filter(
        (part) => part !== "",
      )
      .map(
        (part) =>
          encodeURIComponent(part),
      )
      .join("/");

  return (
    "https://raw.githubusercontent.com/" +
    encodeURIComponent(
      githubConfig.owner,
    ) +
    "/" +
    encodeURIComponent(
      githubConfig.repo,
    ) +
    "/" +
    encodeURIComponent(
      githubConfig.branch,
    ) +
    "/" +
    path
  );
}


export function getGithubEditUrl() {
  if (
    !githubConfig.owner ||
    !githubConfig.repo
  ) {
    return null;
  }

  const path =
    githubConfig.dataPath
      .split("/")
      .filter(
        (part) => part !== "",
      )
      .map(
        (part) =>
          encodeURIComponent(part),
      )
      .join("/");

  return (
    "https://github.com/" +
    encodeURIComponent(
      githubConfig.owner,
    ) +
    "/" +
    encodeURIComponent(
      githubConfig.repo,
    ) +
    "/edit/" +
    encodeURIComponent(
      githubConfig.branch,
    ) +
    "/" +
    path
  );
}


export async function loadRepositoryData(
  showAlert = true,
) {
  const status =
    document.getElementById(
      "dataStatus",
    );

  if (
    !githubConfig.owner ||
    !githubConfig.repo
  ) {
    if (status) {
      status.textContent =
        "GitHub 저장소 미설정";
    }

    if (showAlert) {
      alert(
        "먼저 GitHub 저장소 정보를 입력해주세요.",
      );
    }

    return false;
  }

  const rawUrl =
    getGithubRawUrl();

  if (!rawUrl) {
    return false;
  }

  if (status) {
    status.textContent =
      "GitHub 기록 불러오는 중...";
  }

  try {
    const response =
      await fetch(
        `${rawUrl}?t=${Date.now()}`,
        {
          cache: "no-store",
        },
      );

    if (
      response.status === 404
    ) {
      if (status) {
        status.textContent =
          "GitHub history.json 없음";
      }

      if (showAlert) {
        alert(
          "GitHub 저장소에 history.json이 없습니다.",
        );
      }

      return false;
    }

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`,
      );
    }

    const remoteData =
      normalizeData(
        await response.json(),
      );

    setAppData(
      remoteData,
    );

    saveLocalData(
      remoteData,
    );

    if (status) {
      status.textContent =
        "GitHub 기록 불러오기 완료";
    }

    if (showAlert) {
      alert(
        "GitHub 저장소의 기록을 불러왔습니다.",
      );
    }

    return true;
  } catch (error) {
    console.error(
      "GitHub 기록 불러오기 실패:",
      error,
    );

    if (status) {
      status.textContent =
        "GitHub 기록 불러오기 실패";
    }

    if (showAlert) {
      alert(
        "GitHub 기록을 불러오지 못했습니다.",
      );
    }

    return false;
  }
}


export function handleSaveGithubConfig() {
  try {
    const config =
      readGithubInputs();

    applyGithubConfig(
      config,
    );

    alert(
      "GitHub 설정을 저장했습니다.",
    );

    return true;
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "GitHub 설정을 확인해주세요.",
    );

    return false;
  }
}


export async function handleTestGithub() {
  try {
    const config =
      readGithubInputs();

    applyGithubConfig(
      config,
    );

    return await loadRepositoryData(
      true,
    );
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "GitHub 설정을 확인해주세요.",
    );

    return false;
  }
}


export async function handlePrepareGithub() {
  try {
    const config =
      readGithubInputs();

    applyGithubConfig(
      config,
    );

    const copied =
      await copyJsonToClipboard();

    const url =
      getGithubEditUrl();

    if (!url) {
      throw new Error(
        "GitHub 편집 URL을 만들 수 없습니다.",
      );
    }

    window.open(
      url,
      "_blank",
      "noopener,noreferrer",
    );

    const status =
      document.getElementById(
        "githubSaveStatus",
      );

    if (status) {
      status.textContent =
        copied
          ? "JSON을 복사하고 GitHub 편집 화면을 열었습니다. history.json 전체 내용을 붙여넣은 뒤 Commit changes를 누르세요."
          : "GitHub 편집 화면을 열었습니다. JSON 복사는 실패했습니다.";

      status.classList.add(
        "success",
      );
    }

    return true;
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "GitHub 저장 준비에 실패했습니다.",
    );

    return false;
  }
}


export function handleOpenGithubEdit() {
  try {
    const config =
      readGithubInputs();

    applyGithubConfig(
      config,
    );

    const url =
      getGithubEditUrl();

    if (!url) {
      throw new Error(
        "GitHub 편집 URL을 만들 수 없습니다.",
      );
    }

    window.open(
      url,
      "_blank",
      "noopener,noreferrer",
    );

    return true;
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "GitHub 편집 화면을 열 수 없습니다.",
    );

    return false;
  }
}
