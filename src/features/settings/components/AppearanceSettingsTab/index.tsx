import {
  ACCENTS,
  type Accent,
  DENSITIES,
  type Density,
  THEME_MODES,
  type ThemeMode,
  useTheme,
} from "@/features/shell";

/** テーマモードの表示ラベル。 */
const THEME_LABELS: Record<ThemeMode, string> = {
  light: "ライト",
  dark: "ダーク",
  system: "システム",
};

/** 表示密度の表示ラベル。 */
const DENSITY_LABELS: Record<Density, string> = {
  comfortable: "標準",
  compact: "コンパクト",
};

/** アクセントカラーの表示ラベル。 */
const ACCENT_LABELS: Record<Accent, string> = {
  blue: "ブルー",
  violet: "バイオレット",
  green: "グリーン",
  amber: "アンバー",
  rose: "ローズ",
};

/** アクセントスウォッチのプレビュー色（index.css の data-accent 値と対応）。 */
const ACCENT_HEX: Record<Accent, string> = {
  blue: "#2563eb",
  violet: "#7c3aed",
  green: "#16a34a",
  amber: "#d97706",
  rose: "#e11d48",
};

/**
 * セグメントボタンの className を選択状態に応じて返す。
 * @param isActive - そのボタンが選択中か
 * @returns ボタンに適用する className
 */
const segmentClass = (isActive: boolean): string => {
  if (isActive) {
    return "rounded border border-accent bg-accent-soft px-3 py-1.5 text-sm text-foreground";
  }
  return "rounded border border-border px-3 py-1.5 text-sm text-muted hover:bg-surface-muted";
};

type OptionFieldsetProps<T extends string> = {
  /** 見出し（legend） */
  legend: string;
  /** 選択肢の値一覧 */
  options: readonly T[];
  /** 現在選択中の値 */
  value: T;
  /**
   * 値を表示ラベルへ変換する。
   * @param option - 選択肢の値
   * @returns 表示ラベル
   */
  labelOf: (option: T) => string;
  /**
   * 選択変更ハンドラ。
   * @param next - 選択された値
   */
  onSelect: (next: T) => void;
};

/**
 * 単一選択のセグメントボタン群（fieldset + legend でグループ化）。
 * @param props - {@link OptionFieldsetProps}
 * @returns fieldset 要素
 */
const OptionFieldset = <T extends string>({
  legend,
  options,
  value,
  labelOf,
  onSelect,
}: OptionFieldsetProps<T>) => {
  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 text-sm font-semibold text-foreground">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === value}
            onClick={() => onSelect(option)}
            className={segmentClass(option === value)}
          >
            {labelOf(option)}
          </button>
        ))}
      </div>
    </fieldset>
  );
};

/**
 * 外観（テーマ / 密度 / アクセント）設定タブ。useTheme の state を編集する。
 * 設定はクライアントローカル（localStorage）に保存され、選択は即時反映される。
 * @returns 外観設定パネル
 */
export const AppearanceSettingsTab = () => {
  const { appearance, setTheme, setDensity, setAccent } = useTheme();

  return (
    <section
      className="mx-auto flex w-full max-w-[1080px] flex-col gap-6"
      aria-labelledby="appearance-settings-title"
    >
      <header>
        <h1
          id="appearance-settings-title"
          className="m-0 text-[22px] font-semibold text-foreground"
        >
          外観
        </h1>
        <p className="mt-1 max-w-[68ch] text-[12.5px] text-muted">
          テーマ、表示密度、アクセントカラーは選択と同時にプレビューへ反映され、この端末に保存されます。
        </p>
      </header>
      <div className="flex max-w-lg flex-col gap-6 rounded-lg border border-border bg-surface p-5">
        <OptionFieldset<ThemeMode>
          legend="テーマ"
          options={THEME_MODES}
          value={appearance.theme}
          labelOf={(option) => THEME_LABELS[option]}
          onSelect={setTheme}
        />

        <OptionFieldset<Density>
          legend="表示密度"
          options={DENSITIES}
          value={appearance.density}
          labelOf={(option) => DENSITY_LABELS[option]}
          onSelect={setDensity}
        />

        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-sm font-semibold text-foreground">
            アクセント
          </legend>
          <div className="flex flex-wrap gap-1">
            {ACCENTS.map((accent) => (
              <button
                key={accent}
                type="button"
                aria-pressed={accent === appearance.accent}
                onClick={() => setAccent(accent)}
                className={`flex items-center gap-1.5 ${segmentClass(
                  accent === appearance.accent,
                )}`}
              >
                <span
                  aria-hidden="true"
                  className="size-3 rounded-full"
                  style={{ backgroundColor: ACCENT_HEX[accent] }}
                />
                {ACCENT_LABELS[accent]}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </section>
  );
};
