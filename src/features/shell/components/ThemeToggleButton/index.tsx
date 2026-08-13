import { useTheme } from "../../hooks/useTheme";

/** ライト / ダークを切り替えるtopbar icon button。 */
export const ThemeToggleButton = () => {
  const { resolvedTheme, setTheme } = useTheme();
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
      className="spec-icon-button"
    >
      {isDark ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
          <path d="M20 15.2A8 8 0 1 1 8.8 4 6.5 6.5 0 0 0 20 15.2z" />
        </svg>
      )}
    </button>
  );
};
