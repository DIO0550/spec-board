import { useCallback, useMemo, useState } from "react";
import type { Task } from "@/types/task";
import {
  applyTaskFilter,
  EMPTY_TASK_FILTER,
  isTaskFilterActive,
  pruneTaskFilter,
  type TaskFilterCriteria,
  type TaskFilterOptions,
} from "../../lib/applyTaskFilter";

/** useTaskFilter の返り値。 */
export type UseTaskFilterResult = {
  /**
   * 現在の絞り込み条件。利用可能な選択肢から外れた条件は間引き済み（隠れフィルタを含まない）。
   */
  criteria: TaskFilterCriteria;
  /**
   * 絞り込み条件を更新する。
   * @param next - 新しい条件
   */
  setCriteria: (next: TaskFilterCriteria) => void;
  /** 条件をすべて初期化する。 */
  clear: () => void;
  /** 条件適用後のタスク一覧 */
  filtered: Task[];
  /** いずれかの条件が有効か */
  isActive: boolean;
};

/**
 * `useTaskFilter` のオプション引数（任意）。settings → board ナビゲートで
 * 初期ラベルフィルタを 1 回だけ seed したいときに使う。
 */
export type UseTaskFilterOptions = {
  /**
   * 初回 mount 時の criteria に注入するラベル絞り込みの初期値。`undefined` / 空配列は
   * 「seed しない」と同義（criteria は `EMPTY_TASK_FILTER` のまま）。
   * effect 由来の二重適用を避けるため `useState` 初期化時にのみ参照する。
   */
  initialLabels?: readonly string[];
};

/**
 * ボード上のタスクを検索キーワード / ラベル / 優先度 / ステータス / マイルストーンで
 * 横断的に絞り込むフィルタ state。board の全ビュー（board / list / tree / calendar）で共有する。
 *
 * カラムのリネーム/削除やマイルストーン削除で選択肢が消えると、UI に出ない条件が
 * 「隠れフィルタ」として残り続ける。raw な条件を state に保持したまま、render 中に
 * 利用可能な選択肢で間引いた条件を導出してフィルタ結果へ反映する（effect で書き戻さない）。
 *
 * 第三引数 `init.initialLabels` で初期ラベルフィルタを `useState` 初期値関数で
 * 1 回だけ seed する。effect 由来の `setCriteria` 二重適用を避けるため、後続の依存
 * 変化では再 seed しない（remount で再注入する設計）。
 *
 * @param tasks - 絞り込み対象のタスク一覧
 * @param options - 現在利用可能な選択肢（間引きの基準）
 * @param init - 初期 seed 用オプション（省略可）
 * @returns 絞り込み state と結果
 */
export const useTaskFilter = (
  tasks: Task[],
  options: TaskFilterOptions,
  init?: UseTaskFilterOptions,
): UseTaskFilterResult => {
  const [rawCriteria, setCriteria] = useState<TaskFilterCriteria>(() =>
    init?.initialLabels && init.initialLabels.length > 0
      ? { ...EMPTY_TASK_FILTER, labels: [...init.initialLabels] }
      : EMPTY_TASK_FILTER,
  );

  const clear = useCallback(() => {
    setCriteria(EMPTY_TASK_FILTER);
  }, []);

  const criteria = useMemo(
    () => pruneTaskFilter(rawCriteria, options),
    [rawCriteria, options],
  );

  const filtered = useMemo(
    () => applyTaskFilter(tasks, criteria),
    [tasks, criteria],
  );

  const isActive = useMemo(() => isTaskFilterActive(criteria), [criteria]);

  return { criteria, setCriteria, clear, filtered, isActive };
};
