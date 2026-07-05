import { expect, test, vi } from "vitest";
import { createProjectStore } from "../store";

test("createProjectStore 直後の getState は initialState(idle) を返す", () => {
  const store = createProjectStore();
  expect(store.getState()).toEqual({ kind: "idle" });
});

test("dispatch で reducer が適用され getState が新 state を返す", () => {
  const store = createProjectStore();
  store.dispatch({ type: "open-start", path: "/proj" });
  expect(store.getState()).toEqual({
    kind: "loading",
    path: "/proj",
    previousLoaded: undefined,
  });
});

test("dispatch は登録済み listener を同期的に通知する", () => {
  const store = createProjectStore();
  const listener = vi.fn();
  store.subscribe(listener);
  store.dispatch({ type: "open-start", path: "/proj" });
  expect(listener).toHaveBeenCalledTimes(1);
});

test("subscribe の解除関数呼び出し後は通知されない", () => {
  const store = createProjectStore();
  const listener = vi.fn();
  const unsubscribe = store.subscribe(listener);
  unsubscribe();
  store.dispatch({ type: "open-start", path: "/proj" });
  expect(listener).not.toHaveBeenCalled();
});

test("dispatch 直後（listener 内含む）の getState が同期的に新 state を返す", () => {
  const store = createProjectStore();
  let observedInsideListener: unknown = null;
  store.subscribe(() => {
    observedInsideListener = store.getState();
  });
  store.dispatch({ type: "open-start", path: "/proj" });
  expect(observedInsideListener).toEqual({
    kind: "loading",
    path: "/proj",
    previousLoaded: undefined,
  });
});
