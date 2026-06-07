import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { useFocusTrap } from "..";

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

/**
 * useFocusTrap が返す ref をトラップ対象 `<div tabIndex={-1}>` に取り付け、
 * 内部に 3 つの focusable ボタンを置くテスト用ハーネス。
 * @param props - active フラグ
 */
const TrapHarness = (props: { active: boolean }) => {
  const ref = useFocusTrap<HTMLDivElement>({ active: props.active });
  return createElement(
    "div",
    { ref, tabIndex: -1, "data-testid": "trap-container" },
    createElement("button", { type: "button", "data-testid": "b1" }, "b1"),
    createElement("button", { type: "button", "data-testid": "b2" }, "b2"),
    createElement("button", { type: "button", "data-testid": "b3" }, "b3"),
  );
};

/**
 * 末尾に `tabIndex={-1}` のボタンを置き、タブ順から外れた要素が循環対象から
 * 除外されることを検証するハーネス。
 * @param props - active フラグ
 */
const TabIndexMinusHarness = (props: { active: boolean }) => {
  const ref = useFocusTrap<HTMLDivElement>({ active: props.active });
  return createElement(
    "div",
    { ref, tabIndex: -1, "data-testid": "trap-container" },
    createElement("button", { type: "button", "data-testid": "b1" }, "b1"),
    createElement("button", { type: "button", "data-testid": "b2" }, "b2"),
    createElement(
      "button",
      { type: "button", tabIndex: -1, "data-testid": "bminus" },
      "bminus",
    ),
  );
};

/**
 * focusable 要素を 1 つも持たないトラップ対象を描画するハーネス。
 * @param props - active フラグ
 */
const EmptyHarness = (props: { active: boolean }) => {
  const ref = useFocusTrap<HTMLDivElement>({ active: props.active });
  return createElement("div", {
    ref,
    tabIndex: -1,
    "data-testid": "trap-container",
  });
};

/**
 * hook が返す ref をどの要素にも取り付けないハーネス（未取付 no-op 検証用）。
 * @param props - active フラグ
 */
const NoAttachHarness = (props: { active: boolean }) => {
  useFocusTrap<HTMLDivElement>({ active: props.active });
  return createElement(
    "div",
    null,
    createElement("button", { type: "button", "data-testid": "outside" }, "x"),
  );
};

/**
 * コンテナ外に focusable を 1 つ置きつつトラップを描画するハーネス。
 * コンテナ外フォーカス中の Shift+Tab 引き込みを検証する。
 * @param props - active フラグ
 */
const OutsideHarness = (props: { active: boolean }) => {
  const ref = useFocusTrap<HTMLDivElement>({ active: props.active });
  return createElement(
    "div",
    null,
    createElement(
      "button",
      { type: "button", "data-testid": "outside-btn" },
      "outside",
    ),
    createElement(
      "div",
      { ref, tabIndex: -1, "data-testid": "trap-container" },
      createElement("button", { type: "button", "data-testid": "b1" }, "b1"),
      createElement("button", { type: "button", "data-testid": "b3" }, "b3"),
    ),
  );
};

/**
 * unmount でリスナーが解除されることを検証するため、トラップ外にボタンを置く。
 * unmount 後もこのボタンは残るよう、トラップ部分のみ条件描画する。
 * @param props - active / mounted フラグ
 */
const MountToggleHarness = (props: { active: boolean; mounted: boolean }) => {
  return createElement(
    "div",
    null,
    createElement(
      "button",
      { type: "button", "data-testid": "survivor" },
      "survivor",
    ),
    props.mounted ? createElement(TrapHarness, { active: props.active }) : null,
  );
};

/**
 * ハーネスをレンダリングする。
 * @param element - レンダリング対象の React 要素
 */
const render = (element: ReturnType<typeof createElement>) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(element);
  });
};

/**
 * 指定 testid の要素を取得する。
 * @param testId - data-testid
 * @returns 要素
 */
const byTestId = (testId: string): HTMLElement =>
  document.querySelector(`[data-testid="${testId}"]`) as HTMLElement;

/**
 * Tab キーの keydown を document に dispatch する。
 * cancelable:true を付けないと preventDefault が効かず defaultPrevented が常に false になる。
 * @param shiftKey - Shift 同時押しか
 * @returns dispatch した KeyboardEvent（defaultPrevented を検証できる）
 */
const dispatchTab = (shiftKey = false): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey,
    cancelable: true,
    bubbles: true,
  });
  act(() => {
    document.dispatchEvent(event);
  });
  return event;
};

test("末尾要素で Tab を押すと先頭要素へ循環する", () => {
  render(createElement(TrapHarness, { active: true }));
  byTestId("b3").focus();
  const event = dispatchTab();
  expect(event.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(byTestId("b1"));
});

test("先頭要素で Shift+Tab を押すと末尾要素へ循環する", () => {
  render(createElement(TrapHarness, { active: true }));
  byTestId("b1").focus();
  const event = dispatchTab(true);
  expect(event.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(byTestId("b3"));
});

test("tabIndex=-1 のボタンは循環対象から除外される", () => {
  render(createElement(TabIndexMinusHarness, { active: true }));
  // bminus は tabIndex=-1 のため除外され、b2 が末尾扱いになる。
  // b2 で Tab → 先頭 b1 へ循環し、bminus へは移動しない。
  byTestId("b2").focus();
  const event = dispatchTab();
  expect(event.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(byTestId("b1"));
});

test("中間要素での Tab は preventDefault されず素通しする", () => {
  render(createElement(TrapHarness, { active: true }));
  byTestId("b2").focus();
  const event = dispatchTab();
  expect(event.defaultPrevented).toBe(false);
});

test("コンテナ自身にフォーカス中の Tab で先頭要素へ引き込まれる", () => {
  render(createElement(TrapHarness, { active: true }));
  byTestId("trap-container").focus();
  const event = dispatchTab();
  expect(event.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(byTestId("b1"));
});

test("コンテナ外にフォーカス中の Shift+Tab で末尾要素へ引き込まれる", () => {
  render(createElement(OutsideHarness, { active: true }));
  byTestId("outside-btn").focus();
  const event = dispatchTab(true);
  expect(event.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(byTestId("b3"));
});

test("focusable が 0 件のとき Tab でコンテナ自身にフォーカスする", () => {
  render(createElement(EmptyHarness, { active: true }));
  const event = dispatchTab();
  expect(event.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(byTestId("trap-container"));
});

test("active=false のときはトラップが無効で循環しない", () => {
  render(createElement(TrapHarness, { active: false }));
  byTestId("b3").focus();
  const event = dispatchTab();
  expect(event.defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(byTestId("b3"));
});

test("unmount で keydown リスナーが解除され循環しなくなる", () => {
  render(createElement(MountToggleHarness, { active: true, mounted: true }));
  byTestId("survivor").focus();
  act(() => {
    root?.render(
      createElement(MountToggleHarness, { active: true, mounted: false }),
    );
  });
  const event = dispatchTab();
  expect(event.defaultPrevented).toBe(false);
});

test("返り値 ref を未取付（current=null）でも Tab で例外を投げず no-op になる", () => {
  render(createElement(NoAttachHarness, { active: true }));
  byTestId("outside").focus();
  const event = dispatchTab();
  expect(event.defaultPrevented).toBe(false);
});
