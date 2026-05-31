import { useState } from "react";
import { type NonEmptySettingsTabs, SettingsTab } from "../../types";
import { LabelSettingsTab } from "../LabelSettingsTab";
import { SubNav, subNavPanelId, subNavTabId } from "../SubNav";

/** 設定画面に登録するタブ一覧（現状はラベルタブ 1 枠。NonEmptySettingsTabs で 1 件以上を保証）。 */
const SETTINGS_TABS: NonEmptySettingsTabs = [
  { id: "labels", label: "ラベル", render: () => <LabelSettingsTab /> },
];

/**
 * 設定画面本体。SubNav + アクティブタブの render() を合成する。
 * board state には依存しない（App 側で保持・据え置き）。
 * @returns 設定画面要素
 */
export const SettingsScreen = () => {
  const [activeTabId, setActiveTabId] = useState<string>(SETTINGS_TABS[0].id);
  const activeTab = SettingsTab.selectActive(SETTINGS_TABS, activeTabId);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <SubNav
        tabs={SETTINGS_TABS}
        activeTabId={activeTab.id}
        onSelect={setActiveTabId}
      />
      <div
        role="tabpanel"
        id={subNavPanelId(activeTab.id)}
        aria-labelledby={subNavTabId(activeTab.id)}
        className="flex-1 overflow-auto p-4"
      >
        {activeTab.render()}
      </div>
    </div>
  );
};
