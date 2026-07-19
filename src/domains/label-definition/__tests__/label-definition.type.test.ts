import { expectTypeOf, test } from "vitest";
import {
  LabelDefinition,
  LabelDraft,
  type LabelName,
  type NormalizedLabelName,
} from "../index";

test("LabelName は string へ widening できる", () => {
  const name = LabelDefinition.fromWire({ name: "bug" }).name;
  expectTypeOf(name).toMatchTypeOf<string>();
});

test("string は LabelName へ直接代入できない", () => {
  const raw = "bug";
  // @ts-expect-error string は LabelName に代入不可
  const _name: LabelName = raw;
  void _name;
});

test("toUpdateArgs の第 1 引数に素の string は渡せない", () => {
  const draft = LabelDraft.empty();
  // @ts-expect-error string は LabelName に代入不可
  LabelDraft.toUpdateArgs("bug", draft);
});

test("preview の name を toUpdateArgs に渡せない", () => {
  const draft = LabelDraft.empty();
  const preview = LabelDraft.preview(draft);
  // @ts-expect-error LabelPreview.name は素の string
  LabelDraft.toUpdateArgs(preview.name, draft);
});

test("LabelDefinition.name は readonly のため再代入不可", () => {
  const def = LabelDefinition.fromWire({ name: "bug" });
  // @ts-expect-error readonly property
  def.name = "x" as LabelName;
});

test("raw string は NormalizedLabelName に直接代入できない", () => {
  const raw = "bug";
  // @ts-expect-error string は NormalizedLabelName に代入不可
  const _normalized: NormalizedLabelName = raw;
  void _normalized;
});

test("fromWire 経由の生成は LabelName として代入可能", () => {
  const def = LabelDefinition.fromWire({ name: "bug" });
  expectTypeOf(def.name).toMatchTypeOf<LabelName>();
});
