import type { ComponentProps } from "react";
import { expectTypeOf, test } from "vitest";
import type { MilestoneViewScreen } from "@/features/milestoneView";
import type { SettingsScreen, SettingsTabId } from "@/features/settings";
import type { SettingsTab } from "@/features/settings/types";

type ExpectedSettingsTabId =
  | "labels"
  | "milestones"
  | "statuses"
  | "archive"
  | "trash"
  | "config"
  | "appearance";

test("SettingsTabIdは公開barrelから7種のcanonical IDだけを公開する", () => {
  expectTypeOf<SettingsTabId>().toEqualTypeOf<ExpectedSettingsTabId>();
  expectTypeOf<SettingsTab["id"]>().toEqualTypeOf<SettingsTabId>();
  expectTypeOf<
    "lables" extends SettingsTabId ? true : false
  >().toEqualTypeOf<false>();
});

test("SettingsScreenのinitial値とcallbackはSettingsTabIdを受け渡す", () => {
  type Props = ComponentProps<typeof SettingsScreen>;

  expectTypeOf<Props["initialTabId"]>().toEqualTypeOf<
    SettingsTabId | undefined
  >();
  expectTypeOf<Props["onSettingsTab"]>().toEqualTypeOf<
    ((tabId: SettingsTabId) => void) | undefined
  >();
});

test("MilestoneViewScreenの設定callbackもSettingsTabIdを受け渡す", () => {
  type Props = ComponentProps<typeof MilestoneViewScreen>;

  expectTypeOf<Props["onSettingsTab"]>().toEqualTypeOf<
    ((tabId: SettingsTabId) => void) | undefined
  >();
});
