import { useTheme } from "../../hooks/useTheme";

/**
 * ライト / ダークを素早く切り替えるトグルボタン。
 * 現在の実効配色がダークなら次の操作はライトへ、それ以外はダークへ切り替える
 * （`system` 選択時の実効配色は Provider が解決・OS 追従する。細かな選択は外観設定タブで行う）。
 * @returns テーマ切替ボタン
 */
export const ThemeToggleButton = () => {
  const { resolvedTheme, setTheme } = useTheme();
  // Provider が解決・OS 追従する実効配色で判定する（OS 配色変更にも再描画で追従）。
  const isDark = resolvedTheme === "dark";
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
