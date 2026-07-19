import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { LabelDefinition } from "@/domains/label-definition";
import { LabelSelection } from "@/domains/label-selection";
import { usePopoverDismiss } from "@/hooks/usePopoverDismiss";

/** LabelsField の Props */
export type LabelsFieldProps = {
  /** フィールドのラベルテキスト */
  label: string;
  /** 選択済みラベル一覧（制御値） */
  value: readonly string[];
  /** labels.yml 由来のラベル定義（候補・色）。未取得時は空配列でよい（新規作成のみ可）。 */
  suggestions: readonly LabelDefinition[];
  /**
   * 選択集合の変化を丸ごと返す（toggle / create いずれも次配列を通知）。
   * @param labels - 変更後のラベル一覧
   */
  onChange: (labels: string[]) => void;
  /** 無効化（既定 false） */
  disabled?: boolean;
  /**
   * テスト用 ID。trigger に付与し、popover は `${id}-popover`、検索は `${id}-search`、
   * option は `${id}-option-${name}`、新規作成は `${id}-create`。
   */
  "data-testid": string;
};

/** 色未設定ラベルのグレーバッジ（優先度「なし」相当の中立色）。 */
const NEUTRAL_BADGE_STYLE: CSSProperties = {
  backgroundColor: "var(--color-surface-muted)",
  color: "var(--color-muted)",
  borderColor: "var(--color-border)",
};

/**
 * ラベル名からバッジの配色（背景・文字・枠）を解決する（presentation・domain 非依存）。
 * labels.yml 定義の `color`（#RRGGBB）を基に `color-mix` で淡い背景 + 濃い文字を生成する。
 * 色未設定は中立グレー。
 * @param name - ラベル名
 * @param suggestions - ラベル定義一覧
 * @returns バッジに適用する inline style
 */
const badgeStyleOf = (
  name: string,
  suggestions: readonly LabelDefinition[],
): CSSProperties => {
  const color = suggestions.find((s) => s.name === name)?.color;
  if (color === undefined) {
    return NEUTRAL_BADGE_STYLE;
  }
  return {
    backgroundColor: `color-mix(in srgb, ${color} 16%, white)`,
    color: `color-mix(in srgb, ${color} 78%, black)`,
    borderColor: `color-mix(in srgb, ${color} 34%, white)`,
  };
};

/**
 * ラベル複数選択フィールド（作成・編集共用の唯一実装）。
 * trigger に選択済みラベルを色付きバッジで表示し、popover では検索 + 既存ラベルの
 * 多選択トグル + 未登録名のその場作成を提供する。検索・選択判定・トグル・作成可否は
 * すべて {@link LabelSelection}（大文字小文字を区別しない単一ソース）へ委譲し、UI 層で
 * 判定しない。開閉 / Esc capture 非伝播 / 外側クリックは {@link usePopoverDismiss} に委譲する。
 * @param props - {@link LabelsFieldProps}
 * @returns ラベル複数選択 UI
 */
export const LabelsField = ({
  label,
  value,
  suggestions,
  onChange,
  disabled = false,
  "data-testid": dataTestId,
}: LabelsFieldProps) => {
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const valueId = `${baseId}-value`;
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const { isOpen, toggleOpen, containerRef } = usePopoverDismiss();

  const candidateNames = useMemo(
    () => suggestions.map((s) => s.name),
    [suggestions],
  );
  const filtered = useMemo(
    () => LabelSelection.search(candidateNames, query),
    [candidateNames, query],
  );
  const canCreate = LabelSelection.canCreate(value, candidateNames, query);

  // close（Esc / 外側クリック / trigger 再クリック）で検索クエリを消す。
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
    }
  }, [isOpen]);

  // 開いている間は検索 input へフォーカスする。
  useEffect(() => {
    if (isOpen) {
      searchRef.current?.focus();
    }
  }, [isOpen]);

  /**
   * ✓ 表示・トグル判定（素の Set.has ではなく大文字小文字を区別しない domain helper）。
   * @param name - 候補名
   * @returns 選択済みなら true
   */
  const isSelected = (name: string): boolean =>
    LabelSelection.isSelected(value, name);

  /**
   * 候補名をトグルして次の選択を通知する。
   * @param name - トグル対象の候補名
   */
  const toggle = (name: string) => {
    onChange([...LabelSelection.toggle(value, name)]);
  };

  /** 検索クエリを新規ラベルとして作成する（canCreate ガード後にのみ追加）。 */
  const create = () => {
    if (canCreate) {
      onChange([...value, query.trim()]);
    }
    setQuery("");
  };

  /**
   * 検索 input の keydown。Enter で作成可なら作成、そうでなければ先頭候補をトグルする。
   * IME 変換中の Enter は無視する。
   * @param e - keydown イベント
   */
  const handleSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) {
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (canCreate) {
        create();
        return;
      }
      const [first] = filtered;
      if (first !== undefined) {
        toggle(first);
      }
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <span
        id={labelId}
        className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-wide text-muted"
      >
        {label}
      </span>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-labelledby={`${labelId} ${valueId}`}
        disabled={disabled}
        onClick={toggleOpen}
        className={`flex min-h-10 w-full max-w-[340px] items-center gap-2 rounded-md border bg-panel px-3 py-2 text-left text-sm hover:border-border-strong disabled:opacity-50 ${
          isOpen ? "border-accent" : "border-border"
        }`}
        data-testid={dataTestId}
      >
        <span
          id={valueId}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"
        >
          {value.length === 0 ? (
            <span className="text-text-dim">ラベルを選択…</span>
          ) : (
            value.map((name) => (
              <span
                key={name}
                className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
                style={badgeStyleOf(name, suggestions)}
              >
                {name}
              </span>
            ))
          )}
        </span>
        <span aria-hidden="true" className="shrink-0 text-text-dim">
          ▾
        </span>
      </button>
      {isOpen && (
        <div
          className="absolute left-0 right-0 z-10 mt-1 max-w-[340px] overflow-hidden rounded-lg border border-border-strong bg-panel shadow-lg"
          data-testid={`${dataTestId}-popover`}
        >
          <div className="border-b border-border p-2">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="ラベルを検索または作成…"
              className="w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-sm outline-none focus:border-accent"
              data-testid={`${dataTestId}-search`}
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1.5">
            {filtered.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={isSelected(name)}
                onClick={() => toggle(name)}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-panel-2 aria-pressed:font-medium"
                data-testid={`${dataTestId}-option-${name}`}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex w-3.5 shrink-0 justify-center text-accent"
                >
                  {isSelected(name) ? "✓" : ""}
                </span>
                <span
                  className="inline-flex min-w-0 items-center truncate rounded-full border px-2 py-0.5 text-xs font-medium"
                  style={badgeStyleOf(name, suggestions)}
                >
                  {name}
                </span>
              </button>
            ))}
            {canCreate && (
              <button
                type="button"
                onClick={create}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-accent hover:bg-panel-2"
                data-testid={`${dataTestId}-create`}
              >
                <span aria-hidden="true">＋</span>
                <span className="min-w-0 flex-1 truncate">
                  「{query.trim()}」を作成
                </span>
              </button>
            )}
            {filtered.length === 0 && !canCreate && (
              <p className="px-2.5 py-4 text-center text-xs text-text-dim">
                該当するラベルがありません
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
