import { useTheme } from "../../hooks/useTheme";
import { resolveThemeMode } from "../../lib/applyAppearance";

/**
 * OS がダーク配色を要求しているかを判定する（matchMedia 非対応環境では false）。
 * @returns OS がダーク配色なら true
 */
const prefersDark = (): boolean => {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
};

/**
 * ライト / ダークを素早く切り替えるトグルボタン。
 * 現在の実効配色がダークなら次の操作はライトへ、それ以外はダークへ切り替える
 * （`system` 選択時は OS の配色を解決して実効配色を判定する。細かな選択は外観設定タブで行う）。
 * @returns テーマ切替ボタン
 */
export const ThemeToggleButton = () => {
  const { appearance, setTheme } = useTheme();
  // theme=system のときは OS 配色を解決した実効配色で判定する（dark 固定判定にしない）。
  const isDark = resolveThemeMode(appearance.theme, prefersDark()) === "dark";
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
