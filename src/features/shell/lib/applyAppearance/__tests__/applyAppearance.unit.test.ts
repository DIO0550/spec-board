import { expect, test } from "vitest";
import { resolveAppearanceDataset, resolveThemeMode } from "../index";

test.each([
  ["light 固定はシステム設定に関わらず light", "light", true, "light"],
  ["dark 固定はシステム設定に関わらず dark", "dark", false, "dark"],
  ["system はシステムが dark なら dark", "system", true, "dark"],
  ["system はシステムが light なら light", "system", false, "light"],
] as const)("%s", (_label, theme, systemPrefersDark, expected) => {
  expect(resolveThemeMode(theme, systemPrefersDark)).toBe(expected);
});

test("density / accent はそのまま透過し theme のみ解決する", () => {
  const dataset = resolveAppearanceDataset(
    { theme: "system", density: "compact", accent: "violet" },
    true,
  );

  expect(dataset).toEqual({
    theme: "dark",
    density: "compact",
    accent: "violet",
  });
});
