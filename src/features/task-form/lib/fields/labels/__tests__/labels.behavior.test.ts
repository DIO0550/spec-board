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

test("withInput: labelInput を差し替えた新しい field を返す", () => {
  const next = LabelsField.withInput(LabelsField.initial(), "foo");
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

test("suggestionsFor: 空入力では未確定の候補全件を返す", () => {
  const state: LabelsField = { labels: [], labelInput: "" };
  const suggestions = LabelsField.suggestionsFor(state, ["bug", "feature"]);
  expect(suggestions).toEqual(["bug", "feature"]);
});

test("suggestionsFor: 入力中文字列で大文字小文字を無視した部分一致絞り込みを行う", () => {
  const state: LabelsField = { labels: [], labelInput: "BU" };
  const suggestions = LabelsField.suggestionsFor(state, [
    "bug",
    "build",
    "feature",
  ]);
  expect(suggestions).toEqual(["bug", "build"]);
});

test("suggestionsFor: 確定済みラベルは候補から除外する", () => {
  const state: LabelsField = { labels: ["bug"], labelInput: "" };
  const suggestions = LabelsField.suggestionsFor(state, ["bug", "feature"]);
  expect(suggestions).toEqual(["feature"]);
});

test("suggestionsFor: 候補 0 件なら空配列を返す", () => {
  const state: LabelsField = { labels: [], labelInput: "" };
  expect(LabelsField.suggestionsFor(state, [])).toEqual([]);
});

test("suggestionsFor: 全候補確定済みなら空配列を返す", () => {
  const state: LabelsField = { labels: ["bug", "feature"], labelInput: "" };
  expect(LabelsField.suggestionsFor(state, ["bug", "feature"])).toEqual([]);
});

test("commitValue: 指定値を labels に追加し labelInput をクリアする", () => {
  const next = LabelsField.commitValue(
    { labels: ["a"], labelInput: "bu" },
    "bug",
  );
  expect(next).toEqual({ labels: ["a", "bug"], labelInput: "" });
});

test("commitValue: 確定済みの重複値は labels 不変で labelInput だけクリアする", () => {
  const next = LabelsField.commitValue(
    { labels: ["bug"], labelInput: "bu" },
    "bug",
  );
  expect(next).toEqual({ labels: ["bug"], labelInput: "" });
});

test("commitValue: trim 後空の値は labels 不変", () => {
  const state: LabelsField = { labels: ["a"], labelInput: "  " };
  const next = LabelsField.commitValue(state, "   ");
  expect(next.labels).toEqual(["a"]);
});

test("commitValue: 前後空白は trim して取り込む", () => {
  const next = LabelsField.commitValue(
    { labels: [], labelInput: "" },
    "  bug  ",
  );
  expect(next).toEqual({ labels: ["bug"], labelInput: "" });
});
