import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { LabelDefinition } from "@/lib/tauri";

type LabelsMultiSelectProps = {
  /** フィールドのラベルテキスト */
  label: string;
  /** 選択済みラベル名（確定済み） */
  selected: readonly string[];
  /** labels.yml 由来のラベル定義（name + 任意の色）。 */
  suggestions: readonly LabelDefinition[];
  /**
   * ラベルの選択トグル。未選択なら追加、選択済みなら解除する。
   * @param label - 対象ラベル名
   */
  onToggle: (label: string) => void;
  /** 無効化 */
  disabled: boolean;
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
 * ラベル名からバッジの配色（背景・文字・枠）を解決する。
 * labels.yml 定義の `color`（#RRGGBB）を基に `color-mix` で淡い背景 + 濃い文字を生成し、
 * 優先度バッジ（High 等）と同様の塗り表現にする。色未設定は中立グレー。
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
 * GitHub 風のラベル複数選択 popover。
 * trigger に選択済みラベルを背景色付きバッジ（labels.yml の色を color-mix で塗り分け）で表示し、popover では検索 + 既存ラベルの
 * 多選択トグル + 未登録名のその場作成を提供する。状態は親（useLabelsInput）が保持し、
 * 本コンポーネントは検索クエリと開閉のみをローカルに持つ。option は toggle button
 * （`aria-pressed`）として公開し、open 中の Esc は capture フェーズで捕捉して
 * 画面の破棄確認へ伝播させない。
 * @param props - {@link LabelsMultiSelectProps}
 * @returns ラベル複数選択 UI
 */
export const LabelsMultiSelect = (props: LabelsMultiSelectProps) => {
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const valueId = `${baseId}-value`;
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
  }, []);

  const open = () => {
    setIsOpen(true);
  };

  // open 時に検索 input へフォーカスする。
  useEffect(() => {
    if (isOpen) {
      searchRef.current?.focus();
    }
  }, [isOpen]);

  // open 中だけ capture フェーズで Escape を捕捉し、画面の Esc 破棄確認へ伝播させない。
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, close]);

  // open 中の外側 mousedown で閉じる。
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current === null) {
        return;
      }
      if (e.target instanceof Node && containerRef.current.contains(e.target)) {
        return;
      }
      close();
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isOpen, close]);

  const normalizedQuery = query.trim();
  const filtered = useMemo(() => {
    const q = normalizedQuery.toLowerCase();
    if (q === "") {
      return props.suggestions;
    }
    return props.suggestions.filter((s) => s.name.toLowerCase().includes(q));
  }, [props.suggestions, normalizedQuery]);

  const selectedSet = useMemo(() => new Set(props.selected), [props.selected]);

  // クエリが既存ラベル名（完全一致・大文字小文字無視）・選択済みのいずれにも一致しない
  // 場合のみ「作成」候補を出す。
  const canCreate =
    normalizedQuery !== "" &&
    !props.suggestions.some(
      (s) => s.name.toLowerCase() === normalizedQuery.toLowerCase(),
    ) &&
    !props.selected.some(
      (name) => name.toLowerCase() === normalizedQuery.toLowerCase(),
    );

  const handleSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) {
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (canCreate) {
        props.onToggle(normalizedQuery);
        setQuery("");
        return;
      }
      const [first] = filtered;
      if (first !== undefined) {
        props.onToggle(first.name);
      }
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <span
        id={labelId}
        className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-wide text-muted"
      >
        {props.label}
      </span>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        // ラベル文言 + 選択済みラベル（または「ラベルを選択…」）の両方をアクセシブルネームに
        // 含め、現在の選択が SR で読み上げられるようにする。
        aria-labelledby={`${labelId} ${valueId}`}
        disabled={props.disabled}
        onClick={() => (isOpen ? close() : open())}
        className={`flex min-h-10 w-full max-w-[340px] items-center gap-2 rounded-md border bg-panel px-3 py-2 text-left text-sm hover:border-border-strong disabled:opacity-50 ${
          isOpen ? "border-accent" : "border-border"
        }`}
        data-testid={props["data-testid"]}
      >
        <span
          id={valueId}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"
        >
          {props.selected.length === 0 ? (
            <span className="text-text-dim">ラベルを選択…</span>
          ) : (
            props.selected.map((name) => (
              <span
                key={name}
                className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
                style={badgeStyleOf(name, props.suggestions)}
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
          data-testid={`${props["data-testid"]}-popover`}
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
              data-testid={`${props["data-testid"]}-search`}
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1.5">
            {filtered.map((s) => {
              const isSelected = selectedSet.has(s.name);
              return (
                <button
                  key={s.name}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => props.onToggle(s.name)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-panel-2 aria-pressed:font-medium"
                  data-testid={`${props["data-testid"]}-option-${s.name}`}
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex w-3.5 shrink-0 justify-center text-accent"
                  >
                    {isSelected ? "✓" : ""}
                  </span>
                  <span
                    className="inline-flex min-w-0 items-center truncate rounded-full border px-2 py-0.5 text-xs font-medium"
                    style={badgeStyleOf(s.name, props.suggestions)}
                  >
                    {s.name}
                  </span>
                </button>
              );
            })}
            {canCreate && (
              <button
                type="button"
                onClick={() => {
                  props.onToggle(normalizedQuery);
                  setQuery("");
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-accent hover:bg-panel-2"
                data-testid={`${props["data-testid"]}-create`}
              >
                <span aria-hidden="true">＋</span>
                <span className="min-w-0 flex-1 truncate">
                  「{normalizedQuery}」を作成
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
