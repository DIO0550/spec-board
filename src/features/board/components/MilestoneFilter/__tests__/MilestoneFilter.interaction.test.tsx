import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { MilestoneFilter as MilestoneFilterValue } from "../../../hooks/useMilestoneFilter";
import { MilestoneFilter } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

const render = (
  filter: MilestoneFilterValue,
  onChange: (next: MilestoneFilterValue) => void,
  milestones: { name: string }[],
): void => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(MilestoneFilter, { milestones, filter, onChange }),
    );
  });
};

const setSelectValue = (select: HTMLSelectElement, value: string): void => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
};

const selectOf = (): HTMLSelectElement =>
  container?.querySelector(
    'select[aria-label="マイルストーンで絞り込み"]',
  ) as HTMLSelectElement;

test.each([
  ["__all__"],
  ["__unassigned__"],
  ["milestone:x"],
])("sentinel と紛らわしい名前 %j の milestone を選んでも milestone フィルタになる", (name) => {
  const onChange = vi.fn();
  render({ kind: "all" }, onChange, [{ name }]);
  act(() => {
    setSelectValue(selectOf(), `milestone:${name}`);
  });
  expect(onChange).toHaveBeenCalledWith({ kind: "milestone", name });
});

test("__all__ という名前の milestone は all 制御値とは別の option 値になる", () => {
  const onChange = vi.fn();
  render({ kind: "milestone", name: "__all__" }, onChange, [
    { name: "__all__" },
  ]);
  // 選択中 value が all 制御値（"all"）と一致しないこと（衝突しないエンコード）。
  expect(selectOf().value).toBe("milestone:__all__");
  expect(selectOf().value).not.toBe("all");
});
