import { expect, test } from "vitest";
import { LabelsField } from "..";

test("initial: 引数なしで labels 空 / labelInput 空", () => {
  expect(LabelsField.initial()).toEqual({ labels: [], labelInput: "" });
});

test("initial: 初期 labels が渡されたら反映", () => {
  expect(LabelsField.initial(["a", "b"])).toEqual({
    labels: ["a", "b"],
    labelInput: "",
  });
});

test("reducer: setInput で labelInput を更新", () => {
  const next = LabelsField.reducer(LabelsField.initial(), {
    type: "setInput",
    value: "foo",
  });
  expect(next).toEqual({ labels: [], labelInput: "foo" });
});

test("reducer: commit（空 trim）は state を変更しない", () => {
  const state: ReturnType<typeof LabelsField.initial> = {
    labels: ["a"],
    labelInput: "   ",
  };
  const next = LabelsField.reducer(state, { type: "commit" });
  expect(next).toBe(state);
});

test("reducer: commit（重複）は labelInput だけクリア", () => {
  const next = LabelsField.reducer(
    { labels: ["a"], labelInput: "a" },
    { type: "commit" },
  );
  expect(next).toEqual({ labels: ["a"], labelInput: "" });
});

test("reducer: commit（新規）は labels に追加して labelInput クリア", () => {
  const next = LabelsField.reducer(
    { labels: ["a"], labelInput: "  b  " },
    { type: "commit" },
  );
  expect(next).toEqual({ labels: ["a", "b"], labelInput: "" });
});

test("reducer: remove で指定ラベルを除外", () => {
  const next = LabelsField.reducer(
    { labels: ["a", "b", "c"], labelInput: "" },
    { type: "remove", label: "b" },
  );
  expect(next).toEqual({ labels: ["a", "c"], labelInput: "" });
});

test("commitPendingAndExtract: 空 trim は labels 変化なし", () => {
  const state = { labels: ["a"], labelInput: "" };
  const { next, labels } = LabelsField.commitPendingAndExtract(state);
  expect(next).toBe(state);
  expect(labels).toEqual(["a"]);
});

test("commitPendingAndExtract: 重複は labelInput だけクリア、labels 不変", () => {
  const { next, labels } = LabelsField.commitPendingAndExtract({
    labels: ["a"],
    labelInput: "a",
  });
  expect(next).toEqual({ labels: ["a"], labelInput: "" });
  expect(labels).toEqual(["a"]);
});

test("commitPendingAndExtract: 新規は labels に追加", () => {
  const { next, labels } = LabelsField.commitPendingAndExtract({
    labels: ["a"],
    labelInput: "b",
  });
  expect(next).toEqual({ labels: ["a", "b"], labelInput: "" });
  expect(labels).toEqual(["a", "b"]);
});
