import { expect, test } from "vitest";
import {
  BOARD_VIEW_MODES,
  normalizeBoardViewMode,
} from "@/features/board/hooks/useBoardViewMode";

test("roadmapを5番目の有効なboard view modeとして扱う", () => {
  expect(BOARD_VIEW_MODES).toEqual([
    "board",
    "list",
    "tree",
    "calendar",
    "roadmap",
  ]);
  expect(normalizeBoardViewMode("roadmap")).toBe("roadmap");
});
