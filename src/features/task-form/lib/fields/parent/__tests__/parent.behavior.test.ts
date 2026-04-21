import { expect, test } from "vitest";
import { ParentField } from "..";

test.each([
  { visible: false, initialParent: "x", expected: undefined },
  { visible: true, initialParent: "x", expected: "x" },
  { visible: true, initialParent: undefined, expected: undefined },
  { visible: false, initialParent: undefined, expected: undefined },
])("initial(visible=$visible, initialParent=$initialParent) -> $expected", ({
  visible,
  initialParent,
  expected,
}) => {
  expect(ParentField.initial(visible, initialParent)).toBe(expected);
});

test.each([
  { visible: false, initialParent: "y", expected: undefined },
  { visible: true, initialParent: "y", expected: "y" },
  { visible: true, initialParent: undefined, expected: undefined },
])("reset(visible=$visible, initialParent=$initialParent) -> $expected", ({
  visible,
  initialParent,
  expected,
}) => {
  expect(ParentField.reset(visible, initialParent)).toBe(expected);
});
