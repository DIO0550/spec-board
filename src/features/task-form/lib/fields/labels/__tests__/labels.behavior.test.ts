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

test("setInput: labelInput を更新する", () => {
  const next = LabelsField.setInput(LabelsField.initial(), "foo");
  expect(next).toEqual({ labels: [], labelInput: "foo" });
});

test("commit: 空 trim は state を変更しない", () => {
  const state: LabelsField = { labels: ["a"], labelInput: "   " };
  const next = LabelsField.commit(state);
  expect(next).toBe(state);
});

test("commit: 重複は labelInput だけクリアし labels 不変", () => {
  const next = LabelsField.commit({ labels: ["a"], labelInput: "a" });
  expect(next).toEqual({ labels: ["a"], labelInput: "" });
});

test("commit: 新規は labels に追加し labelInput クリア", () => {
  const next = LabelsField.commit({ labels: ["a"], labelInput: "  b  " });
  expect(next).toEqual({ labels: ["a", "b"], labelInput: "" });
});

test("remove: 指定ラベルを除外する", () => {
  const next = LabelsField.remove(
    { labels: ["a", "b", "c"], labelInput: "" },
    "b",
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
