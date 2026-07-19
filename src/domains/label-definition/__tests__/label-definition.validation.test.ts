import roundTrip from "@fixtures/label-name/round-trip.json";
import { expect, test } from "vitest";
import { LabelDefinition, LabelDraft } from "../index";

const existing = LabelDefinition.listFromWire([
  { name: "bug" },
  { name: "Bug" },
  { name: "feature" },
]);

test("妥当な新規 name で errors/warnings が空になる", () => {
  const draft = { name: "new-label", description: "", group: "", color: "" };
  const result = LabelDraft.validate(draft, existing, null);
  expect(result.errors).toEqual([]);
  expect(result.warnings).toEqual([]);
});

test("空文字 name で name-required エラー", () => {
  const draft = { name: "", description: "", group: "", color: "" };
  const result = LabelDraft.validate(draft, existing, null);
  expect(result.errors).toEqual([{ code: "name-required" }]);
});

test("空白のみ name で name-required エラー", () => {
  const draft = { name: "   ", description: "", group: "", color: "" };
  const result = LabelDraft.validate(draft, existing, null);
  expect(result.errors).toEqual([{ code: "name-required" }]);
});

test("required 成立時に name-outer-whitespace 警告は出ない（短絡）", () => {
  const draft = { name: "   ", description: "", group: "", color: "" };
  const result = LabelDraft.validate(draft, existing, null);
  expect(result.warnings).toEqual([]);
});

test("完全一致重複で name-duplicate エラー", () => {
  const draft = { name: "bug", description: "", group: "", color: "" };
  const result = LabelDraft.validate(draft, existing, null);
  expect(result.errors).toContainEqual({
    code: "name-duplicate",
    existing: "bug",
  });
});

test("case 差のみの類似名で name-similar 警告（送信は許容）", () => {
  const list = LabelDefinition.listFromWire([{ name: "Bug" }]);
  const draft = { name: "bug", description: "", group: "", color: "" };
  const result = LabelDraft.validate(draft, list, null);
  expect(result.errors).toEqual([]);
  expect(result.warnings).toContainEqual({
    code: "name-similar",
    existing: "Bug",
  });
});

test("前後空白付き name で name-outer-whitespace 警告", () => {
  const draft = { name: "  new  ", description: "", group: "", color: "" };
  const result = LabelDraft.validate(draft, [], null);
  expect(result.warnings).toContainEqual({ code: "name-outer-whitespace" });
});

test("不正 HEX color で color-invalid 警告", () => {
  const draft = { name: "x", description: "", group: "", color: "#12" };
  const result = LabelDraft.validate(draft, [], null);
  expect(result.warnings).toContainEqual({ code: "color-invalid" });
});

test("空文字 color では color-invalid 警告なし", () => {
  const draft = { name: "x", description: "", group: "", color: "" };
  const result = LabelDraft.validate(draft, [], null);
  expect(result.warnings).toEqual([]);
});

test("前後空白付きの妥当 HEX では color-invalid 警告なし", () => {
  const draft = { name: "x", description: "", group: "", color: "#7860b5 " };
  const result = LabelDraft.validate(draft, [], null);
  expect(result.warnings).toEqual([]);
});

test("編集モードは name 系 validation をスキップする", () => {
  const editingName = LabelDefinition.fromWire({ name: "bug" }).name;
  const draft = { name: "bug", description: "", group: "", color: "red" };
  const result = LabelDraft.validate(draft, existing, editingName);
  expect(result.errors).toEqual([]);
  expect(result.warnings).toContainEqual({ code: "color-invalid" });
  expect(result.warnings).not.toContainEqual(
    expect.objectContaining({ code: "name-duplicate" }),
  );
});

test("前後空白付き label の編集で errors が出ず送信可能", () => {
  const def = LabelDefinition.fromWire({ name: "  bug  " });
  const draft = LabelDraft.fromDefinition(def);
  const result = LabelDraft.validate(draft, existing, def.name);
  expect(result.errors).toEqual([]);
});

test("空白のみ name の label を編集しても errors 空", () => {
  const def = LabelDefinition.fromWire({ name: "   " });
  const draft = LabelDraft.fromDefinition(def);
  const result = LabelDraft.validate(draft, [def], def.name);
  expect(result.errors).toEqual([]);
});

test("errors と warnings の同時列挙", () => {
  const draft = { name: "bug", description: "", group: "", color: "red" };
  const result = LabelDraft.validate(draft, existing, null);
  expect(result.errors.length).toBeGreaterThan(0);
  expect(result.warnings).toContainEqual({ code: "color-invalid" });
});

test("類似候補が複数あるとき定義順で先頭 1 件のみ", () => {
  const list = LabelDefinition.listFromWire([
    { name: "bug " },
    { name: " BUG" },
  ]);
  const draft = { name: "Bug", description: "", group: "", color: "" };
  const result = LabelDraft.validate(draft, list, null);
  const similarWarnings = result.warnings.filter(
    (w) => w.code === "name-similar",
  );
  expect(similarWarnings).toHaveLength(1);
  expect(similarWarnings[0]).toEqual({
    code: "name-similar",
    existing: "bug ",
  });
});

test("特殊名の duplicate 判定", () => {
  const list = LabelDefinition.listFromWire([{ name: "__proto__" }]);
  const draft = { name: "__proto__", description: "", group: "", color: "" };
  const result = LabelDraft.validate(draft, list, null);
  expect(result.errors).toContainEqual({
    code: "name-duplicate",
    existing: "__proto__",
  });
});

test.each(roundTrip.duplicatePairs)("fixture duplicatePairs: $id", ({
  existing: existingName,
  candidate,
  exactDuplicate,
  similar,
}) => {
  const list = LabelDefinition.listFromWire([{ name: existingName }]);
  const draft = { name: candidate, description: "", group: "", color: "" };
  const result = LabelDraft.validate(draft, list, null);
  const hasDuplicateError = result.errors.some(
    (e) => e.code === "name-duplicate",
  );
  const hasSimilarWarning = result.warnings.some(
    (w) => w.code === "name-similar",
  );
  expect(hasDuplicateError).toBe(exactDuplicate);
  expect(hasSimilarWarning).toBe(similar);
});
