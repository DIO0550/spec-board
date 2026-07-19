import { expect, test } from "vitest";
import { LabelDefinition, LabelDraft, LabelName } from "../index";

test("byName が完全一致キーで定義を引き当てる", () => {
  const labels = LabelDefinition.listFromWire([
    { name: "bug" },
    { name: "feature" },
  ]);
  const map = LabelDefinition.byName(labels);
  expect(map.get("bug")?.name).toBe("bug");
  expect(map.get("feature")?.name).toBe("feature");
  expect(map.get("unknown")).toBeUndefined();
});

test("byName は __proto__ 名ラベルでも汚染されない", () => {
  const labels = LabelDefinition.listFromWire([
    { name: "__proto__" },
    { name: "constructor" },
  ]);
  const map = LabelDefinition.byName(labels);
  expect(map.get("__proto__")?.name).toBe("__proto__");
  expect(map.get("constructor")?.name).toBe("constructor");
  expect(map.size).toBe(2);
});

test("LabelName.normalize は trim + 小文字化する", () => {
  expect(LabelName.normalize("  Bug  ")).toBe("bug");
});

test("LabelName.normalize は NFC/NFD を collapse しない", () => {
  const nfc = "café";
  const nfd = "café";
  expect(LabelName.normalize(nfc)).not.toBe(LabelName.normalize(nfd));
});

test("LabelName.normalize の case + 空白複合差は同一キーになる", () => {
  expect(LabelName.normalize(" BUG ")).toBe(LabelName.normalize("bug"));
});

test("usageOf は own property の件数を返す", () => {
  const counts = { bug: 3, feature: 0 };
  expect(LabelDefinition.usageOf(counts, "bug")).toBe(3);
  expect(LabelDefinition.usageOf(counts, "feature")).toBe(0);
});

test("usageOf は継承プロパティを拾わない", () => {
  const counts: Record<string, number> = { bug: 1 };
  expect(LabelDefinition.usageOf(counts, "constructor")).toBe(0);
  expect(LabelDefinition.usageOf(counts, "__proto__")).toBe(0);
  expect(LabelDefinition.usageOf(counts, "toString")).toBe(0);
});

test("usageOf は own 値ありの特殊名では件数を返す", () => {
  const counts: Record<string, number> = { constructor: 5 };
  expect(LabelDefinition.usageOf(counts, "constructor")).toBe(5);
});

test("empty の初期値は全フィールド空文字", () => {
  expect(LabelDraft.empty()).toEqual({
    name: "",
    description: "",
    group: "",
    color: "",
  });
});

test("fromDefinition は raw をそのまま写し未定義は空文字にする", () => {
  const def = LabelDefinition.fromWire({ name: "  bug  ", description: "d" });
  const draft = LabelDraft.fromDefinition(def);
  expect(draft.name).toBe("  bug  ");
  expect(draft.description).toBe("d");
  expect(draft.group).toBe("");
  expect(draft.color).toBe("");
});

test("preview は空 name を 'preview' にする", () => {
  const draft = LabelDraft.empty();
  expect(LabelDraft.preview(draft).name).toBe("preview");
});

test("preview は空文字フィールドを undefined にする", () => {
  const draft = LabelDraft.empty();
  const preview = LabelDraft.preview(draft);
  expect(preview.description).toBeUndefined();
  expect(preview.group).toBeUndefined();
  expect(preview.color).toBeUndefined();
});

test("preview は有効 HEX のみ color に反映する", () => {
  expect(
    LabelDraft.preview({
      name: "x",
      description: "",
      group: "",
      color: "#7860b5",
    }).color,
  ).toBe("#7860b5");
  expect(
    LabelDraft.preview({ name: "x", description: "", group: "", color: "red" })
      .color,
  ).toBeUndefined();
  expect(
    LabelDraft.preview({
      name: "x",
      description: "",
      group: "",
      color: "#AABBCC ",
    }).color,
  ).toBe("#AABBCC");
});
