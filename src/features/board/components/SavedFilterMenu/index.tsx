import { useState } from "react";
import type { TaskFilterCriteria } from "@/features/board/lib/applyTaskFilter";
import type { SavedFilter } from "@/features/board/lib/savedFilters";
import { usePopoverDismiss } from "@/hooks/usePopoverDismiss";

/** SavedFilterMenu の Props */
type SavedFilterMenuProps = {
  /** 保存済みフィルタ一覧 */
  filters: readonly SavedFilter[];
  /** 何らかの絞り込みが有効か（現在の条件を保存できるか） */
  isFilterActive: boolean;
  /** 現在の絞り込み条件（保存用） */
  criteria: TaskFilterCriteria;
  /**
   * 保存済みフィルタ適用時のコールバック。
   * @param criteria - 適用する条件
   */
  onApply: (criteria: TaskFilterCriteria) => void;
  /**
   * 現在の条件の保存要求。
   * @param name - 保存名（trim 済み）
   * @param criteria - 保存する条件
   * @returns 保存に成功したか
   */
  onSave: (name: string, criteria: TaskFilterCriteria) => boolean;
  /**
   * 保存済みフィルタの削除要求。
   * @param name - 削除対象の名前
   */
  onRemove: (name: string) => void;
};

/**
 * サブバーに置く保存済みフィルタのドロップダウン。
 * 一覧からの 1 クリック適用・現在の条件の名前付き保存・個別削除を提供する。
 * 永続化はプロジェクト単位のクライアントローカル（localStorage）で、
 * 実体は {@link SavedFilter} を所有する useSavedFilters 側に委ねる。
 * @param props - {@link SavedFilterMenuProps}
 * @returns 保存済みフィルタメニュー要素
 */
export const SavedFilterMenu = ({
  filters,
  isFilterActive,
  criteria,
  onApply,
  onSave,
  onRemove,
}: SavedFilterMenuProps) => {
  const popover = usePopoverDismiss();
  const [nameInput, setNameInput] = useState("");

  /** 現在の条件を入力名で保存する。成功時は入力をクリアする。 */
  const handleSave = (): void => {
    const saved = onSave(nameInput.trim(), criteria);
    if (saved) {
      setNameInput("");
    }
  };

  return (
    <div ref={popover.containerRef} className="relative">
      <button
        type="button"
        onClick={popover.toggleOpen}
        aria-haspopup="dialog"
        aria-expanded={popover.isOpen}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 text-xs font-medium text-muted hover:text-foreground"
        data-testid="saved-filter-trigger"
      >
        保存済みフィルタ
        {filters.length > 0 && (
          <span className="rounded-full bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] leading-none">
            {filters.length}
          </span>
        )}
        <span aria-hidden="true">▾</span>
      </button>
      {popover.isOpen && (
        <div
          role="dialog"
          aria-label="保存済みフィルタ"
          className="absolute right-0 top-8 z-40 w-72 rounded-[10px] border border-border bg-surface p-2 shadow-lg"
          data-testid="saved-filter-popover"
        >
          {filters.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted">
              保存済みフィルタはありません
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {filters.map((filter) => (
                <li key={filter.name} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      onApply(filter.criteria);
                      popover.close();
                    }}
                    className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-surface-muted"
                    data-testid="saved-filter-apply"
                  >
                    {filter.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(filter.name)}
                    aria-label={`${filter.name} を削除`}
                    className="size-6 shrink-0 rounded text-muted hover:bg-danger-soft hover:text-danger"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-2">
            <input
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              onKeyDown={(event) => {
                // IME 変換確定の Enter では保存しない。
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  handleSave();
                }
              }}
              aria-label="保存名"
              placeholder="現在の条件に名前を付けて保存"
              disabled={!isFilterActive}
              className="h-7 min-w-0 flex-1 rounded border border-border bg-surface px-2 text-xs disabled:opacity-50"
              data-testid="saved-filter-name-input"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={!isFilterActive || nameInput.trim() === ""}
              className="h-7 shrink-0 rounded-md border border-border px-2 text-xs font-medium disabled:opacity-50"
              data-testid="saved-filter-save"
            >
              保存
            </button>
          </div>
          {!isFilterActive && (
            <p className="mt-1 px-1 text-[10.5px] text-text-dim">
              絞り込みを設定すると現在の条件を保存できます
            </p>
          )}
        </div>
      )}
    </div>
  );
};
