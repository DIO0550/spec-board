import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { MilestoneToolbar } from "..";

const baseProps: Omit<Parameters<typeof MilestoneToolbar>[0], "filterCounts"> =
  {
    filter: "all",
    onFilterChange: vi.fn(),
    query: "",
    onQueryChange: vi.fn(),
    sort: "order",
    onSortChange: vi.fn(),
    view: "list",
    onViewChange: vi.fn(),
  };

const filterButtonCounts = (markup: string): string[] => {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = markup;
  return Array.from(
    wrapper.querySelectorAll('[data-testid^="milestone-filter-"] > span'),
  ).map((span) => span.textContent ?? "");
};

test("filterCounts未指定時はフィルター件数を表示しない", () => {
  const markup = renderToStaticMarkup(
    createElement(MilestoneToolbar, baseProps),
  );

  expect(filterButtonCounts(markup)).toEqual([]);
});

test("filterCounts指定時はフィルター件数を表示する", () => {
  const markup = renderToStaticMarkup(
    createElement(MilestoneToolbar, {
      ...baseProps,
      filterCounts: { all: 2, open: 1, overdue: 0, closed: 1 },
    }),
  );
  expect(filterButtonCounts(markup)).toEqual(["2", "1", "0", "1"]);
});
