import { expect, test } from "vitest";
import {
  type NonEmptySettingsTabs,
  SettingsTab,
} from "@/features/settings/types";

const tabA: SettingsTab = { id: "labels", label: "ラベル" };
const tabB: SettingsTab = { id: "appearance", label: "外観" };

test("selectActive: 一致する ID のタブを返す", () => {
  const tabs: NonEmptySettingsTabs = [tabA, tabB];
  expect(SettingsTab.selectActive(tabs, "appearance")).toBe(tabB);
});

test("selectActive: 先頭タブの ID を渡すと先頭タブを返す", () => {
  const tabs: NonEmptySettingsTabs = [tabA, tabB];
  expect(SettingsTab.selectActive(tabs, "labels")).toBe(tabA);
});

test("selectActive: 未知 ID は先頭タブにフォールバックする", () => {
  const tabs: NonEmptySettingsTabs = [tabA, tabB];
  expect(SettingsTab.selectActive(tabs, "zzz")).toBe(tabA);
});

test("selectActive: 1 枠のみで未知 ID でも先頭タブを返す（クラッシュしない）", () => {
  const tabs: NonEmptySettingsTabs = [tabA];
  expect(SettingsTab.selectActive(tabs, "zzz")).toBe(tabA);
});
