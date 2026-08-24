import { expect, test } from "vitest";
import {
  BOARD_VIEW_MODES,
  normalizeBoardViewMode,
} from "@/features/board/hooks/useBoardViewMode";

test("board view modeは永続化可能な5種だけを定義する", () => {
  expect(BOARD_VIEW_MODES).toEqual([
    "board",
    "list",
    "tree",
    "calendar",
    "roadmap",
  ]);
});

test.each(
  BOARD_VIEW_MODES,
)("%sを有効なboard view modeとして保持する", (mode) => {
  expect(normalizeBoardViewMode(mode)).toBe(mode);
});

test.each([
  null,
  "guide",
  "",
  "unknown",
])("%sは永続化対象外としてboardへ正規化する", (value) => {
  expect(normalizeBoardViewMode(value)).toBe("board");
});
