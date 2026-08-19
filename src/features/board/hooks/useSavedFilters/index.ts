import { useCallback, useEffect, useState } from "react";
import type { TaskFilterCriteria } from "@/features/board/lib/applyTaskFilter";
import {
  loadSavedFilters,
  persistSavedFilter,
  removeSavedFilter,
  type SavedFilter,
} from "@/features/board/lib/savedFilters";

/** useSavedFilters の返却値。 */
export type UseSavedFiltersResult = {
  /** 現在のプロジェクトの保存済みフィルタ一覧 */
  filters: SavedFilter[];
  /**
   * 現在の条件を名前を付けて保存する（同名は上書き）。
   * @param name - 保存名（trim して空なら保存しない）
   * @param criteria - 保存する絞り込み条件
   * @returns 保存したか（空名・上限到達で false）
   */
  save: (name: string, criteria: TaskFilterCriteria) => boolean;
  /**
   * 保存済みフィルタを削除する。
   * @param name - 削除対象の名前
   */
  remove: (name: string) => void;
};

/**
 * プロジェクト単位の保存済みフィルタ（localStorage 永続化）を扱うフック。
 * 外観設定と同じクライアントローカル方針で、`.spec-board/` には書かない。
 * @param projectPath - プロジェクトの絶対パス（未 open は undefined = 空一覧・保存不可）
 * @returns {@link UseSavedFiltersResult}
 */
export const useSavedFilters = (
  projectPath: string | undefined,
): UseSavedFiltersResult => {
  const [filters, setFilters] = useState<SavedFilter[]>([]);

  useEffect(() => {
    setFilters(projectPath === undefined ? [] : loadSavedFilters(projectPath));
  }, [projectPath]);

  const save = useCallback(
    (name: string, criteria: TaskFilterCriteria): boolean => {
      const trimmed = name.trim();
      if (projectPath === undefined || trimmed === "") {
        return false;
      }
      const next = persistSavedFilter(projectPath, {
        name: trimmed,
        criteria,
      });
      setFilters(next);
      return next.some((filter) => filter.name === trimmed);
    },
    [projectPath],
  );

  const remove = useCallback(
    (name: string): void => {
      if (projectPath === undefined) {
        return;
      }
      setFilters(removeSavedFilter(projectPath, name));
    },
    [projectPath],
  );

  return { filters, save, remove };
};
