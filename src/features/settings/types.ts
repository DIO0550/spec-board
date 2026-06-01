/**
 * 設定サブナビのタブ 1 件（表示用データのみ）。
 * 「どのコンポーネントを描画するか」は view 層（SettingsScreen）の責務なので
 * ここには持たせない。本型・companion は React 非依存の純粋ロジックに保つ。
 */
export type SettingsTab = {
  /**
   * タブ識別子（一意）。`settings-tab-${id}` / `settings-panel-${id}` の DOM id に
   * そのまま使うため、空白や記号を含まない ASCII slug（例 "labels" / "appearance"）に限定する。
   */
  id: string;
  /** タブに表示するラベル文言 */
  label: string;
};

/** 1 件以上を型レベルで保証するタブ一覧（空配列を排除し selectActive の戻り値を非 null に固定）。 */
export type NonEmptySettingsTabs = readonly [SettingsTab, ...SettingsTab[]];

/**
 * SettingsTab の companion。タブ集合に対する操作をまとめる
 * （`LabelRegistry` / `Result` と同じ「型 + 同名オブジェクト」パターン）。
 */
export const SettingsTab = {
  /**
   * activeTabId に対応するタブを返す。未知 ID は先頭タブにフォールバックする。
   * 引数を NonEmptySettingsTabs にすることで `tabs[0]` が常に存在し、戻り型 SettingsTab が実行時と一致する。
   * @param tabs - タブ一覧（1 件以上を型で保証）
   * @param activeTabId - アクティブにしたいタブ ID
   * @returns 一致するタブ、なければ tabs[0]
   */
  selectActive: (
    tabs: NonEmptySettingsTabs,
    activeTabId: string,
  ): SettingsTab => {
    return tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  },
} as const;
