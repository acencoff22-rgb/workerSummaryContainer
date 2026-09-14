"use strict";

/*
 * 배정표 생성(optimizeMonth)은 계산량이 많아
 * 메인 스레드에서 그대로 실행하면 화면이
 * 수십 초 동안 멈춘 것처럼 보인다.
 *
 * 그래서 이 파일은 별도의 Web Worker로 로드되어
 * 계산만 여기서 수행하고, 결과를 postMessage로
 * 돌려준다. 메인 스레드(app.js)는 그동안 계속
 * 응답 가능한 상태로 남아있는다.
 */

import {
  optimizeMonth,
} from "./assignment.js";

self.addEventListener(
  "message",
  (event) => {
    const {
      year,
      month,
      startDay,
      endDay,
      startingCounts,
    } = event.data || {};

    try {
      const schedule =
        optimizeMonth(
          year,
          month,
          startDay,
          endDay,
          startingCounts,
        );

      self.postMessage({
        ok: true,
        schedule,
      });
    } catch (error) {
      self.postMessage({
        ok: false,

        message:
          error instanceof Error
            ? error.message
            : "배정표 생성 중 오류가 발생했습니다.",
      });
    }
  },
);
