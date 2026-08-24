import { useMemo } from "react";
import { BrokenRefLabel } from "@/components/BrokenRefLabel";
import { buildTasksByNormalizedPath } from "@/domains/broken-link";
import { normalizeRefPathForLookup } from "@/domains/task-path";
import { type SubIssueCounts, TaskProjection } from "@/domains/task-projection";
import type { Task, TaskFilePath, TaskId } from "@/types/task";

type SubIssueSectionProps = {
  /** 親タスク */
  parentTask: Task;
  /** 直接の子タスク一覧（<ul> リスト表示用） */
  childTasks: readonly Task[];
  /** 全子孫の完了数 / 総数（BE projection 由来） */
  subIssueCounts: SubIssueCounts;
  /**
   * 子タスクの完了判定（BE projection 由来）。
   * @param filePath - 判定対象 task の filePath
   * @returns 完了カラムに居れば true
   */
  isDone: (filePath: TaskFilePath) => boolean;
  /**
   * 「+ サブIssue 追加」ボタン押下時のコールバック。
   * 親タスクのファイルパスを引数に受け取り、タスク作成フォームを開く想定。
   * @param parentFilePath - 親タスクのファイルパス
   */
  onAddSubIssue: (parentFilePath: TaskFilePath) => void;
  /**
   * 子タスクをクリックした際のコールバック（任意）。
   * @param childId - 対象の子タスクID
   */
  onChildClick?: (childId: TaskId) => void;
  /**
   * `parentTask.hierarchy.childFilePaths` のうちリンク切れと判定された raw path 集合。
   * 該当 path の行は WarningIcon + 「リンク切れ」テキスト + 取消線スタイルで表示する。
   * 未指定時は broken 行を一切描画しない（後方互換）。
   */
  brokenChildPaths?: ReadonlySet<string>;
};

/** 行描画用の中間表現。`childFilePaths` 順を維持しつつ「resolved Task / broken path」を切り替える。 */
type ChildRow =
  | { readonly kind: "resolved"; readonly task: Task }
  | {
      readonly kind: "broken";
      readonly rawPath: string;
      /** broken 行の連番（0 始まり）。CSS セレクタが扱いにくい raw path の代替 testid キー。 */
      readonly brokenIndex: number;
    };

/**
 * `childFilePaths` の順序を保ちながら、各 path を `childTasks` から解決するか broken 行として残すかを決める。
 * - `normalizeRefPathForLookup` で正規化したキーが `childTasks` の `normalizeTaskPathForLookup(filePath)` と一致すれば resolved
 *   （空文字 / 絶対 path / Windows drive prefix は正規化が undefined を返すため、resolved にならず broken 扱いに回る）
 * - resolved にできなかった path が `brokenChildPaths` に含まれていれば broken
 * - どちらにも当たらない path はスキップ（過剰描画を防ぐ）
 * @param childFilePaths 親 task の raw 参照配列
 * @param childTasks 解決済み子タスク
 * @param brokenChildPaths broken と判定された raw path 集合
 * @returns 描画順に並んだ {@link ChildRow}
 */
export const buildChildRowList = (
  childFilePaths: readonly TaskFilePath[],
  childTasks: readonly Task[],
  brokenChildPaths: ReadonlySet<string> | undefined,
): readonly ChildRow[] => {
  // 子タスクを正規化済み filePath で 1 度だけ Map 化し、各 rawPath は 1 回の
  // 正規化 + Map 参照で解決する。childFilePaths × childTasks の二重ループを避けて
  // O(childFilePaths + childTasks) に抑える。broken-link ドメインと同じ key 規約。
  const childByNormalizedPath = buildTasksByNormalizedPath(childTasks);

  const rows: ChildRow[] = [];
  let brokenIndex = 0;
  for (const rawPath of childFilePaths) {
    const refKey = normalizeRefPathForLookup(rawPath);
    const resolved =
      refKey === undefined ? undefined : childByNormalizedPath.get(refKey);
    if (resolved !== undefined) {
      rows.push({ kind: "resolved", task: resolved });
      continue;
    }
    if (brokenChildPaths?.has(rawPath)) {
      rows.push({ kind: "broken", rawPath, brokenIndex });
      brokenIndex += 1;
    }
  }
  return rows;
};

/**
 * 詳細（DetailScreen）内のサブIssue セクション。
 * 子タスクの進捗と一覧、「+ サブIssue 追加」ボタンを表示する。
 *
 * @param props - {@link SubIssueSectionProps}
 * @returns サブIssue セクション要素
 */
export const SubIssueSection = ({
  parentTask,
  childTasks,
  subIssueCounts,
  isDone,
  onAddSubIssue,
  onChildClick,
  brokenChildPaths,
}: SubIssueSectionProps) => {
  const { done, total } = subIssueCounts;
  const percentage = TaskProjection.percentage(subIssueCounts);

  const rows = useMemo(
    () =>
      buildChildRowList(
        parentTask.hierarchy.childFilePaths,
        childTasks,
        brokenChildPaths,
      ),
    [parentTask.hierarchy.childFilePaths, childTasks, brokenChildPaths],
  );

  const showProgress = total > 0;
  const showChildList = rows.length > 0;

  return (
    <div
      data-testid="sub-issue-section"
      className="border-b border-border px-[18px] py-4"
    >
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          サブIssue {showProgress ? `(${done}/${total})` : ""}
        </span>
      </div>
      {showProgress && (
        <div className="mb-2 flex items-center gap-2">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full border border-border bg-surface-muted"
            role="progressbar"
            aria-valuenow={percentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`進捗 ${done}/${total}`}
          >
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className="text-xs text-muted">
            {done}/{total}
          </span>
        </div>
      )}
      {showChildList && (
        <ul className="mb-2 space-y-1 text-sm text-foreground">
          {rows.map((row) => {
            if (row.kind === "broken") {
              return (
                <li
                  key={`broken-${row.brokenIndex}-${row.rawPath}`}
                  data-testid={`sub-issue-broken-${row.brokenIndex}`}
                  data-path={row.rawPath}
                  data-broken="true"
                  className="flex items-center gap-2 px-1.5 py-1"
                >
                  <BrokenRefLabel rawPath={row.rawPath} />
                </li>
              );
            }
            const child = row.task;
            const childDone = isDone(child.filePath);
            const label = child.title || child.filePath;
            return (
              <li key={child.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-surface-muted disabled:cursor-default disabled:hover:bg-transparent"
                  disabled={onChildClick === undefined}
                  onClick={() => onChildClick?.(child.id)}
                  data-testid={`sub-issue-item-${child.id}`}
                >
                  <span
                    aria-hidden="true"
                    className={childDone ? "text-green-600" : "text-muted"}
                  >
                    {childDone ? "✓" : "○"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <span className="text-xs text-muted">{child.status}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        className="w-full rounded-md border border-dashed border-border-strong px-2 py-1.5 text-xs font-medium text-muted hover:border-accent hover:bg-accent-soft hover:text-accent disabled:opacity-50"
        onClick={() => onAddSubIssue(parentTask.filePath)}
        data-testid="sub-issue-add-button"
      >
        + サブIssue 追加
      </button>
    </div>
  );
};
