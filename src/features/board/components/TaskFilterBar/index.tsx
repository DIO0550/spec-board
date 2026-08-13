import { Priority } from "@/domains/priority";
import type { MilestoneDefinition } from "@/lib/tauri";
import type { TaskFilterCriteria } from "../../lib/applyTaskFilter";
import { MilestoneFilter } from "../MilestoneFilter";

/** TaskFilterBar の Props。 */
type TaskFilterBarProps = {
  /** 現在の絞り込み条件 */
  criteria: TaskFilterCriteria;
  /**
   * 条件変更ハンドラ。
   * @param next - 新しい条件
   */
  onChange: (next: TaskFilterCriteria) => void;
  /** 条件をすべて初期化する。 */
  onClear: () => void;
  /** 選択肢として並べるラベル名一覧 */
  availableLabels: readonly string[];
  /** 選択肢として並べるステータス（カラム名）一覧 */
  statuses: readonly string[];
  /** マイルストーン定義一覧 */
  milestones: readonly MilestoneDefinition[];
  /** いずれかの条件が有効か */
  isActive: boolean;
  /** 絞り込み後の件数 */
  filteredCount: number;
  /** 絞り込み前の総件数 */
  totalCount: number;
};

/**
 * 配列の要素をトグルする（存在すれば除去、なければ追加）。
 * @param list - 元の配列
 * @param value - トグル対象の値
 * @returns トグル後の新しい配列
 */
const toggleValue = <T,>(list: readonly T[], value: T): T[] => {
  if (list.includes(value)) {
    return list.filter((item) => item !== value);
  }
  return [...list, value];
};

/**
 * チップトグルボタンの className を選択状態に応じて返す。
 * @param isActive - 選択中か
 * @returns チップに適用する className
 */
const chipClass = (isActive: boolean): string => {
  if (isActive) {
    return "rounded-full border border-accent-border bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-foreground";
  }
  return "rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs text-muted hover:border-border-strong hover:bg-bg";
};

/**
 * ボードのタスク横断フィルタ UI。検索 / ラベル / 優先度 / ステータス / マイルストーンを
 * 1 か所で操作する。選択状態は呼び出し側（useTaskFilter）が保持する。
 * @param props - {@link TaskFilterBarProps}
 * @returns フィルタバー要素
 */
export const TaskFilterBar = ({
  criteria,
  onChange,
  onClear,
  availableLabels,
  statuses,
  milestones,
  isActive,
  filteredCount,
  totalCount,
}: TaskFilterBarProps) => {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-panel-2 px-4 py-2 print:hidden">
      <input
        type="search"
        value={criteria.keyword}
        onChange={(event) =>
          onChange({ ...criteria, keyword: event.target.value })
        }
        placeholder="タスクを検索…"
        aria-label="タスクを検索"
        className="h-7 min-w-60 rounded-md border border-border bg-bg px-2.5 text-xs text-foreground placeholder:text-text-dim focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent-soft"
      />

      <fieldset className="flex items-center gap-1 border-0 p-0">
        <legend className="sr-only">優先度で絞り込み</legend>
        {Priority.OPTIONS.map((priority) => (
          <button
            key={priority}
            type="button"
            aria-pressed={criteria.priorities.includes(priority)}
            onClick={() =>
              onChange({
                ...criteria,
                priorities: toggleValue(criteria.priorities, priority),
              })
            }
            className={chipClass(criteria.priorities.includes(priority))}
          >
            {priority}
          </button>
        ))}
      </fieldset>

      {statuses.length > 0 && (
        <fieldset className="flex flex-wrap items-center gap-1 border-0 p-0">
          <legend className="sr-only">ステータスで絞り込み</legend>
          {statuses.map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={criteria.statuses.includes(status)}
              onClick={() =>
                onChange({
                  ...criteria,
                  statuses: toggleValue(criteria.statuses, status),
                })
              }
              className={chipClass(criteria.statuses.includes(status))}
            >
              {status}
            </button>
          ))}
        </fieldset>
      )}

      {availableLabels.length > 0 && (
        <fieldset className="flex flex-wrap items-center gap-1 border-0 p-0">
          <legend className="sr-only">ラベルで絞り込み</legend>
          {availableLabels.map((label) => (
            <button
              key={label}
              type="button"
              aria-pressed={criteria.labels.includes(label)}
              onClick={() =>
                onChange({
                  ...criteria,
                  labels: toggleValue(criteria.labels, label),
                })
              }
              className={chipClass(criteria.labels.includes(label))}
            >
              {label}
            </button>
          ))}
        </fieldset>
      )}

      <MilestoneFilter
        milestones={milestones}
        filter={criteria.milestone}
        onChange={(milestone) => onChange({ ...criteria, milestone })}
      />

      <span className="text-xs text-muted">
        {filteredCount} / {totalCount} 件
      </span>

      {isActive && (
        <button
          type="button"
          onClick={onClear}
          className="rounded-md px-2 py-1 text-xs text-accent hover:bg-bg"
        >
          クリア
        </button>
      )}
    </div>
  );
};
