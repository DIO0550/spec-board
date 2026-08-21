import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import {
  type UseSavedFiltersResult,
  useSavedFilters,
} from "@/features/board/hooks/useSavedFilters";
import { EMPTY_TASK_FILTER } from "@/features/board/lib/applyTaskFilter";
import { loadSavedFilters } from "@/features/board/lib/savedFilters";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  window.localStorage.clear();
});

/**
 * useSavedFilters を mount して最新値を観測する。
 * @param projectPath - フックへ渡すプロジェクトパス
 * @returns 最新値 getter と projectPath 差し替え用 rerender
 */
function mountHook(projectPath: string | undefined) {
  let latest: UseSavedFiltersResult | null = null;
  const Probe = ({ path }: { path: string | undefined }) => {
    latest = useSavedFilters(path);
    return null;
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(Probe, { path: projectPath }));
  });
  return {
    get latest(): UseSavedFiltersResult {
      return latest as UseSavedFiltersResult;
    },
    rerender(path: string | undefined) {
      act(() => {
        root?.render(createElement(Probe, { path }));
      });
    },
  };
}

test("保存すると一覧と localStorage の両方へ反映される", () => {
  const probe = mountHook("/projects/alpha");
  let saved = false;
  act(() => {
    saved = probe.latest.save("バグだけ", {
      ...EMPTY_TASK_FILTER,
      labels: ["bug"],
    });
  });
  expect(saved).toBe(true);
  expect(probe.latest.filters.map((filter) => filter.name)).toEqual([
    "バグだけ",
  ]);
  expect(loadSavedFilters("/projects/alpha")).toHaveLength(1);
});

test("空白のみの名前は保存しない", () => {
  const probe = mountHook("/projects/alpha");
  let saved = true;
  act(() => {
    saved = probe.latest.save("   ", EMPTY_TASK_FILTER);
  });
  expect(saved).toBe(false);
  expect(probe.latest.filters).toEqual([]);
});

test("projectPath 未指定では空一覧のまま保存できない", () => {
  const probe = mountHook(undefined);
  let saved = true;
  act(() => {
    saved = probe.latest.save("name", EMPTY_TASK_FILTER);
  });
  expect(saved).toBe(false);
  expect(probe.latest.filters).toEqual([]);
});

test("プロジェクト切替で該当プロジェクトの一覧へ入れ替わる", () => {
  const probe = mountHook("/projects/alpha");
  act(() => {
    probe.latest.save("alpha のフィルタ", EMPTY_TASK_FILTER);
  });
  probe.rerender("/projects/beta");
  expect(probe.latest.filters).toEqual([]);
  probe.rerender("/projects/alpha");
  expect(probe.latest.filters.map((filter) => filter.name)).toEqual([
    "alpha のフィルタ",
  ]);
});

test("削除で一覧から消える", () => {
  const probe = mountHook("/projects/alpha");
  act(() => {
    probe.latest.save("消すフィルタ", EMPTY_TASK_FILTER);
  });
  act(() => {
    probe.latest.remove("消すフィルタ");
  });
  expect(probe.latest.filters).toEqual([]);
  expect(loadSavedFilters("/projects/alpha")).toEqual([]);
});
