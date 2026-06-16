import { expect, test } from "vitest";
import { LabelRegistry } from "@/domains/label-registry";
import { resolveLabelSwatchStyle } from "@/features/settings/lib/labelSettings/swatch";

test("color が指定されているとき backgroundColor だけ採用する", () => {
  const style = resolveLabelSwatchStyle({ name: "bug", color: "#ef4444" });
  expect(style.backgroundColor).toBe("#ef4444");
  // color 指定時は group/name 由来の fg/bd は使わない
  expect(style.color).toBeUndefined();
  expect(style.borderColor).toBeUndefined();
});

test("color が無く group がある場合は group トークンを使う", () => {
  const style = resolveLabelSwatchStyle({ name: "x", group: "type" });
  const tokens = LabelRegistry.tokensForGroup("type");
  expect(style.color).toBe(tokens.fg);
  expect(style.backgroundColor).toBe(tokens.bg);
  expect(style.borderColor).toBe(tokens.bd);
});

test("color/group が無い場合は name から解決する", () => {
  const style = resolveLabelSwatchStyle({ name: "priority:high" });
  const tokens = LabelRegistry.tokensForLabel("priority:high");
  expect(style.color).toBe(tokens.fg);
  expect(style.backgroundColor).toBe(tokens.bg);
  expect(style.borderColor).toBe(tokens.bd);
});
