import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import {
  getConfigFiles,
  openConfigFile,
  regenerateGuide,
  revealConfigFolder,
} from "@/lib/tauri";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue(undefined);
});

test.each([
  [getConfigFiles, "get_config_files", undefined],
  [regenerateGuide, "regenerate_guide", undefined],
  [revealConfigFolder, "reveal_config_folder", undefined],
] as const)("%s invokes restricted config command", async (call, command, args) => {
  await call();
  expect(invoke).toHaveBeenCalledWith(command, args);
});

test("openConfigFile sends only the closed target id", async () => {
  await openConfigFile({ target: "guide" });
  expect(invoke).toHaveBeenCalledWith("open_config_file", {
    args: { target: "guide" },
  });
});

test("openConfigFile accepts the fixed labels registry target", async () => {
  await openConfigFile({ target: "labels" });
  expect(invoke).toHaveBeenCalledWith("open_config_file", {
    args: { target: "labels" },
  });
});
