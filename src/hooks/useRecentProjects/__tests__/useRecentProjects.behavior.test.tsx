import { act, createElement, StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  RECENT_PROJECTS_STORAGE_KEY,
  type UseRecentProjectsResult,
  useRecentProjects,
} from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  localStorage.clear();
});

/**
 * useRecentProjects の戻り値を観測する Probe。
 * @param props - 最新値を受け取るコールバック
 * @returns null
 */
const Probe = (props: { onResult: (r: UseRecentProjectsResult) => void }) => {
  const result = useRecentProjects();
  useEffect(() => {
    props.onResult(result);
  });
  return null;
};

/**
 * Probe を StrictMode 下でマウントし、最新値を取得する。
 * @returns latest accessor
 */
const renderHook = () => {
  let latest: UseRecentProjectsResult | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const handleResult = (r: UseRecentProjectsResult) => {
    latest = r;
  };
  act(() => {
    root?.render(
      createElement(
        StrictMode,
        null,
        createElement(Probe, { onResult: handleResult }),
      ),
    );
  });
  return {
    get latest(): UseRecentProjectsResult {
      return latest as UseRecentProjectsResult;
    },
  };
};

const readStored = (): unknown =>
  JSON.parse(localStorage.getItem(RECENT_PROJECTS_STORAGE_KEY) ?? "null");

test("add は projects state を更新し localStorage へ永続化する", () => {
  const probe = renderHook();
  act(() => {
    probe.latest.add("/home/user/proj");
  });
  expect(probe.latest.projects).toEqual([
    { path: "/home/user/proj", name: "proj" },
  ]);
  expect(readStored()).toEqual([{ path: "/home/user/proj", name: "proj" }]);
});

test("StrictMode の updater 二重実行でも履歴が二重追加されない", () => {
  const probe = renderHook();
  act(() => {
    probe.latest.add("/a");
  });
  act(() => {
    probe.latest.add("/a");
  });
  expect(probe.latest.projects.map((project) => project.path)).toEqual(["/a"]);
  expect(readStored()).toEqual([{ path: "/a", name: "a" }]);
});

test("連続 add は最新を先頭にして永続化する", () => {
  const probe = renderHook();
  act(() => {
    probe.latest.add("/a");
  });
  act(() => {
    probe.latest.add("/b");
  });
  expect(probe.latest.projects.map((project) => project.path)).toEqual([
    "/b",
    "/a",
  ]);
  expect(readStored()).toEqual([
    { path: "/b", name: "b" },
    { path: "/a", name: "a" },
  ]);
});
