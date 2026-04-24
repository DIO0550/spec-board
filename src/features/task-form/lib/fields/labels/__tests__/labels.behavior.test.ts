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

test("finalize: 空 trim は現 labels をそのまま返す", () => {
  const labels = LabelsField.finalize({ labels: ["a"], labelInput: "" });
  expect(labels).toEqual(["a"]);
});

test("finalize: pending が重複でも現 labels を返す", () => {
  const labels = LabelsField.finalize({ labels: ["a"], labelInput: "a" });
  expect(labels).toEqual(["a"]);
});

test("finalize: pending が新規なら取り込んだ配列を返す", () => {
  const labels = LabelsField.finalize({ labels: ["a"], labelInput: "b" });
  expect(labels).toEqual(["a", "b"]);
});
