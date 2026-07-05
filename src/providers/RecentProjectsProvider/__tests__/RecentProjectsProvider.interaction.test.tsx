import { act, createElement, StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test } from "vitest";
import { RECENT_PROJECTS_STORAGE_KEY } from "@/hooks/useRecentProjects/helpers";
import { RecentProjectsProvider } from "..";
import { type RecentProjectsContextValue, useRecentProjects } from "../context";

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

/** useRecentProjects の戻り値を観測する Probe。 */
const Probe = (props: {
  onResult: (r: RecentProjectsContextValue) => void;
}) => {
  const result = useRecentProjects();
  useEffect(() => {
    props.onResult(result);
  });
  return null;
};

const readStored = (): unknown =>
  JSON.parse(localStorage.getItem(RECENT_PROJECTS_STORAGE_KEY) ?? "null");

/**
 * Provider 配下に 2 つの Probe を並べて mount し、両者の最新値を取得する。
 * @param strict StrictMode で包むか
 * @returns 2 consumer それぞれの latest accessor
 */
const renderTwoConsumers = (strict = false) => {
  let latestA: RecentProjectsContextValue | null = null;
  let latestB: RecentProjectsContextValue | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const tree = createElement(
    RecentProjectsProvider,
    null,
    createElement(Probe, {
      onResult: (r) => {
        latestA = r;
      },
    }),
    createElement(Probe, {
      onResult: (r) => {
        latestB = r;
      },
    }),
  );
  act(() => {
    root?.render(strict ? createElement(StrictMode, null, tree) : tree);
  });
  return {
    get a(): RecentProjectsContextValue {
      return latestA as RecentProjectsContextValue;
    },
    get b(): RecentProjectsContextValue {
      return latestB as RecentProjectsContextValue;
    },
  };
};

test("Provider 配下の一方の add が他方の consumer にも反映される", () => {
  const probes = renderTwoConsumers();
  act(() => {
    probes.a.add("/home/user/proj");
  });
  expect(probes.b.projects).toEqual([
    { path: "/home/user/proj", name: "proj" },
  ]);
});

test("add は projects を更新し localStorage へ永続化する", () => {
  const probes = renderTwoConsumers();
  act(() => {
    probes.a.add("/home/user/proj");
  });
  expect(probes.a.projects).toEqual([
    { path: "/home/user/proj", name: "proj" },
  ]);
  expect(readStored()).toEqual([{ path: "/home/user/proj", name: "proj" }]);
});

test("履歴は最大 8 件で古いエントリが FIFO 切り落としされる", () => {
  const probes = renderTwoConsumers();
  for (let i = 0; i < 10; i += 1) {
    act(() => {
      probes.a.add(`/p${i}`);
    });
  }
  expect(probes.a.projects).toHaveLength(8);
  expect(probes.a.projects[0].path).toBe("/p9");
  expect(probes.a.projects[7].path).toBe("/p2");
});

test("reload シミュレーション（remount）で localStorage から履歴が復元される", () => {
  const first = renderTwoConsumers();
  act(() => {
    first.a.add("/a");
  });
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;

  const second = renderTwoConsumers();
  expect(second.a.projects).toEqual([{ path: "/a", name: "a" }]);
});

test("StrictMode の updater 二重実行でも履歴が二重追加されない", () => {
  const probes = renderTwoConsumers(true);
  act(() => {
    probes.a.add("/a");
  });
  expect(probes.a.projects.map((project) => project.path)).toEqual(["/a"]);
  expect(readStored()).toEqual([{ path: "/a", name: "a" }]);
});

test("StrictMode の mount → cleanup → 再 mount でも localStorage が保持される", () => {
  const probes = renderTwoConsumers(true);
  act(() => {
    probes.a.add("/a");
  });
  expect(readStored()).toEqual([{ path: "/a", name: "a" }]);
});
