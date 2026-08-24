import { expect, expectTypeOf, test } from "vitest";
import { type TabItem, TabNav } from "..";

type ViewId = "board" | "list";

const tabs = [
  { id: "board", label: "ボード" },
  { id: "list", label: "一覧" },
] as const satisfies readonly TabItem<ViewId>[];

test("tabsのID unionをactiveTabIdとonSelectへ貫通する", () => {
  const element = TabNav({
    tabs,
    activeTabId: "board",
    idPrefix: "views",
    onSelect: (tabId) => {
      expectTypeOf(tabId).toEqualTypeOf<ViewId>();
    },
  });

  expect(element).toBeDefined();
});

test("tabsに存在しないactiveTabIdを型境界で拒否する", () => {
  const element = TabNav({
    tabs,
    // @ts-expect-error activeTabIdはtabsのID unionだけを受け付ける。
    activeTabId: "unknown",
    idPrefix: "views",
    onSelect: () => {},
  });

  expect(element).toBeDefined();
});
