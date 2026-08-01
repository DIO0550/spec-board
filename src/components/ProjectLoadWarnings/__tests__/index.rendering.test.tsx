import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { ProjectLoadWarnings } from "@/components/ProjectLoadWarnings";
import type { ProjectLoadWarning } from "@/domains/project-load-warning";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const reactActEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

beforeAll(() => {
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

const warning = (
  overrides: Partial<ProjectLoadWarning> = {},
): ProjectLoadWarning => ({
  code: "binaryFile",
  stage: "scan",
  path: "tasks/broken.md",
  message: "バイナリファイルのため読み込めません",
  recoverable: true,
  ...overrides,
});

const render = (warnings: readonly ProjectLoadWarning[]) => {
  act(() => {
    root?.render(createElement(ProjectLoadWarnings, { warnings }));
  });
};

test("warnings が空なら panel を描画しない", () => {
  render([]);
  expect(
    container?.querySelector('[data-testid="project-load-warnings"]'),
  ).toBeNull();
});

test("件数と展開後の path / stage / message を表示する", () => {
  render([
    warning(),
    warning({
      code: "frontmatterParseFailed",
      stage: "parse",
      path: "tasks/invalid.md",
      message: "frontmatter is invalid",
    }),
  ]);
  expect(container?.textContent).toContain("読み込み時の注意（2件）");
  const details = container?.querySelector("details");
  expect(details).not.toBeNull();
  act(() => {
    details?.setAttribute("open", "");
    root?.render(
      createElement(ProjectLoadWarnings, {
        warnings: [
          warning(),
          warning({
            code: "frontmatterParseFailed",
            stage: "parse",
            path: "tasks/invalid.md",
            message: "frontmatter is invalid",
          }),
        ],
      }),
    );
  });
  expect(container?.textContent).toContain("tasks/invalid.md");
  expect(container?.textContent).toContain("解析");
  expect(container?.textContent).toContain("frontmatter is invalid");
});

test("unknown code、null path、空messageを安全に表示する", () => {
  render([
    warning({
      code: "unknown",
      stage: "unknown",
      path: null,
      message: "",
    }),
  ]);
  expect(container?.textContent).toContain("読み込み警告");
  expect(container?.textContent).toContain("プロジェクト全体");
  expect(container?.textContent).toContain("詳細は確認できませんでした");
});

test("長いpathとmessageに折り返し用classとpolite live regionがある", () => {
  render([
    warning({
      path: "tasks/".concat("a".repeat(240), ".md"),
      message: "x".repeat(240),
    }),
  ]);
  const panel = container?.querySelector<HTMLElement>(
    '[data-testid="project-load-warnings"]',
  );
  expect(panel?.getAttribute("aria-live")).toBe("polite");
  expect(container?.querySelector("code")?.className).toContain("break-all");
  expect(container?.querySelector("p")?.className).toContain("break-words");
});
