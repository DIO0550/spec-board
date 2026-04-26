import { Priority } from "@/domains/priority";

/** PrioritySelect の Props */
type PrioritySelectProps = {
  /** 現在の優先度（未設定の場合は undefined） */
  value: Priority | undefined;
  /**
   * 優先度変更時のコールバック
   * @param priority - 選択された優先度（「なし」の場合は undefined）
   */
  onChange: (priority: Priority | undefined) => void;
};

/**
 * ドメイン値（Priority | undefined）を HTML select の value 用文字列に変換する。
 * UI 層に閉じたアダプタで、`""` は HTML select 仕様上の「未選択」を示す。
 * @param p - ドメイン値
 * @returns HTML select 用の文字列
 */
const toSelectValue = (p: Priority | undefined): string => p ?? "";

/**
 * 優先度を変更するドロップダウン
 * @param props - {@link PrioritySelectProps}
 * @returns セレクト要素
 */
export const PrioritySelect = ({ value, onChange }: PrioritySelectProps) => {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-gray-500">優先度</span>
      <select
        value={toSelectValue(value)}
        onChange={(e) => {
          onChange(Priority.parse(e.target.value));
        }}
        className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800 hover:border-blue-300 focus:border-blue-400 focus:outline-none"
        data-testid="priority-select"
        aria-label="優先度"
      >
        <option value="">なし</option>
        {Priority.OPTIONS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </div>
  );
};
