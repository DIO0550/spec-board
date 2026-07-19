import roundTrip from "@fixtures/label-name/round-trip.json";
import { expect, test } from "vitest";
import type { WireLabelDefinition } from "@/lib/tauri";
import { LabelDefinition, LabelDraft } from "../index";

test("fromWire が全フィールドを写す", () => {
  const wire: WireLabelDefinition = {
    name: "bug",
    description: "A bug report",
    group: "type",
    color: "#ef4444",
    updated: "2024-01-01T00:00:00Z",
  };
  const result = LabelDefinition.fromWire(wire);
  expect(result).toEqual({
    name: "bug",
    description: "A bug report",
    group: "type",
    color: "#ef4444",
    updated: "2024-01-01T00:00:00Z",
  });
});

test("fromWire の欠損 optional フィールドは undefined 維持", () => {
  const wire: WireLabelDefinition = { name: "minimal" };
  const result = LabelDefinition.fromWire(wire);
  expect(result.name).toBe("minimal");
  expect(result.description).toBeUndefined();
  expect(result.group).toBeUndefined();
  expect(result.color).toBeUndefined();
  expect(result.updated).toBeUndefined();
});

test("listFromWire が定義順を保持する", () => {
  const wires: WireLabelDefinition[] = [
    { name: "first" },
    { name: "second" },
    { name: "third" },
  ];
  const result = LabelDefinition.listFromWire(wires);
  expect(result.map((d) => d.name)).toEqual(["first", "second", "third"]);
});

test("listFromWire の空配列", () => {
  const result = LabelDefinition.listFromWire([]);
  expect(result).toEqual([]);
});

test.each(
  roundTrip.identityCases,
)("fixture identityCases: $id の name が raw 一致する（fromWire）", ({
  name,
}) => {
  const wire: WireLabelDefinition = { name };
  const result = LabelDefinition.fromWire(wire);
  expect(result.name).toBe(name);
});

test("toCreateArgs が name を raw 保持する", () => {
  const draft = { name: "  bug  ", description: "", group: "", color: "" };
  const args = LabelDraft.toCreateArgs(draft);
  expect(args.name).toBe("  bug  ");
});

test("toCreateArgs の任意フィールドは trim 後空なら undefined", () => {
  const draft = { name: "x", description: "   ", group: "   ", color: "   " };
  const args = LabelDraft.toCreateArgs(draft);
  expect(args.description).toBeUndefined();
  expect(args.group).toBeUndefined();
  expect(args.color).toBeUndefined();
});

test("toCreateArgs の非空 description/group は trim する", () => {
  const draft = { name: "x", description: " desc ", group: " grp ", color: "" };
  const args = LabelDraft.toCreateArgs(draft);
  expect(args.description).toBe("desc");
  expect(args.group).toBe("grp");
});

test("toUpdateArgs が identity を第 1 引数の LabelName で固定する", () => {
  const def = LabelDefinition.fromWire({ name: "Bug" });
  const draft = { name: "changed", description: "d", group: "g", color: "" };
  const args = LabelDraft.toUpdateArgs(def.name, draft);
  expect(args.name).toBe("Bug");
});

test("toUpdateArgs が description/group を raw 保持する", () => {
  const def = LabelDefinition.fromWire({ name: "x" });
  const draft = { name: "x", description: " desc ", group: " grp ", color: "" };
  const args = LabelDraft.toUpdateArgs(def.name, draft);
  expect(args.description).toBe(" desc ");
  expect(args.group).toBe(" grp ");
});

test("toUpdateArgs の空欄クリア（description/group が空文字 → undefined）", () => {
  const def = LabelDefinition.fromWire({ name: "x" });
  const draft = { name: "x", description: "", group: "", color: "" };
  const args = LabelDraft.toUpdateArgs(def.name, draft);
  expect(args.description).toBeUndefined();
  expect(args.group).toBeUndefined();
});

test("color は両経路とも trim 済み値を送信する", () => {
  const draft = { name: "x", description: "", group: "", color: "#7860b5 " };
  expect(LabelDraft.toCreateArgs(draft).color).toBe("#7860b5");
  const def = LabelDefinition.fromWire({ name: "x" });
  expect(LabelDraft.toUpdateArgs(def.name, draft).color).toBe("#7860b5");
});

test("toUpdateArgs の空白のみ group は raw 保持する", () => {
  const def = LabelDefinition.fromWire({ name: "x" });
  const draft = { name: "x", description: "", group: "   ", color: "" };
  const args = LabelDraft.toUpdateArgs(def.name, draft);
  expect(args.group).toBe("   ");
});

test.each(
  roundTrip.identityCases,
)("fixture identityCases: $id の name identity 経路検証（create）", ({
  name,
}) => {
  const wire: WireLabelDefinition = { name };
  const def = LabelDefinition.fromWire(wire);
  const draft = LabelDraft.fromDefinition(def);
  const args = LabelDraft.toCreateArgs(draft);
  expect(args.name).toBe(name);
});

test.each(
  roundTrip.identityCases,
)("fixture identityCases: $id の name identity 経路検証（update）", ({
  name,
}) => {
  const wire: WireLabelDefinition = { name };
  const def = LabelDefinition.fromWire(wire);
  const draft = LabelDraft.fromDefinition(def);
  const args = LabelDraft.toUpdateArgs(def.name, draft);
  expect(args.name).toBe(name);
});
