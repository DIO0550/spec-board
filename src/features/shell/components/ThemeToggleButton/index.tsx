import { useTheme } from "../../hooks/useTheme";

/**
 * ライト / ダークを素早く切り替えるトグルボタン。
 * 現在ダークなら次の操作はライトへ、それ以外はダークへ切り替える
 * （`system` を含む細かな選択は外観設定タブで行う）。
 * @returns テーマ切替ボタン
 */
export const ThemeToggleButton = () => {
  const { appearance, setTheme } = useTheme();
  const isDark = appearance.theme === "dark";
  const nextLabel = isDark
    ? "ライトテーマに切り替え"
    : "ダークテーマに切り替え";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={nextLabel}
      title={nextLabel}
      className="rounded px-2 py-1.5 text-sm text-muted hover:bg-surface-muted"
    >
      <span aria-hidden="true">{isDark ? "☀️" : "🌙"}</span>
    </button>
  );
};
