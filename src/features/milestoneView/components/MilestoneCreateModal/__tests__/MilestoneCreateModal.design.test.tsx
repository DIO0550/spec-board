import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MilestoneCreateModal } from "..";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

test("名前欄を空のまま離れると検証メッセージと保存先ヒントを表示する", () => {
  act(() =>
    root.render(
      <MilestoneCreateModal
        onCreate={vi.fn()}
        isPending={false}
        onClose={vi.fn()}
      />,
    ),
  );
  const input = host.querySelector<HTMLInputElement>(
    '[data-testid="milestone-create-name"]',
  );
  act(() =>
    input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
  );
  expect(
    host.querySelector('[data-testid="milestone-create-name-error"]')
      ?.textContent,
  ).toContain("名前を入力");
  expect(host.textContent).toContain("milestones.yml");
});
