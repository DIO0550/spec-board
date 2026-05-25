import { useMemo, useState } from "react";
import { TaskSelect } from "@/components/TaskSelect";
import { TaskLinks } from "@/domains/task-links";
import { useAddLink } from "@/features/detail/hooks/useAddLink";
import type { Task } from "@/types/task";
import type { Result } from "@/utils/result";

/** LinksSection Props */
export type LinksSectionProps = {
  /** 表示対象タスク */
  readonly task: Task;
  /** プロジェクトの全タスク（候補絞り込み用。`TaskLinks.buildAddLinkCandidates` の母集団） */
  readonly allTasks: readonly Task[];
  /** 親タスクの filePath（無ければ null） */
  readonly parentFilePath: string | null;
  /** 子タスクの filePath 配列 */
  readonly childrenFilePaths: readonly string[];
  /**
   * リンク追加コールバック。source filePath / target filePath を受け取る。
   * @param sourceFilePath リンク元タスク filePath
   * @param targetFilePath リンク先タスク filePath
   * @returns invoke 結果
   */
  readonly onAddLink: (
    sourceFilePath: string,
    targetFilePath: string,
  ) => Promise<Result<Task, unknown>>;
};

/**
 * DetailPanel の関連タスクセクション。`linkedFilePaths` / `reverseLinkedFilePaths`
 * を一覧表示し、`+ リンク追加` 押下で TaskSelect popover を開いて候補から選択する。
 *
 * @param props - {@link LinksSectionProps}
 * @returns 関連タスク UI
 */
export const LinksSection = (props: LinksSectionProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const candidates = useMemo(
    () =>
      TaskLinks.buildAddLinkCandidates({
        self: props.task,
        allTasks: props.allTasks,
        parentFilePath: props.parentFilePath,
        childrenFilePaths: props.childrenFilePaths,
      }),
    [props.task, props.allTasks, props.parentFilePath, props.childrenFilePaths],
  );

  const sourceFilePath = props.task.filePath;
  const { isBusy, addLink } = useAddLink({
    onAddLink: (target) => props.onAddLink(sourceFilePath, target),
  });

  // TaskSelect.onChange は同期戻り値型のため、ここで async 関数を渡すと
  // 戻り Promise が await されず unhandled rejection の原因になる。
  // 同期関数として宣言し、addLink の Promise は void + catch で明示的に握る。
  // （useAddLink 側で try/finally による isBusy 復帰は済んでいるため、ここでの catch は
  // 防御的ガード。エラー通知は App.handleAddLink の toast/announce 経路で行う）
  const handleSelect = (targetFilePath: string | null): void => {
    if (targetFilePath === null) {
      return;
    }
    setIsOpen(false);
    void addLink(targetFilePath).catch(() => undefined);
  };

  return (
    <section
      data-testid="links-section"
      aria-label="関連タスク"
      className="flex flex-col gap-2"
    >
      <h3 className="text-sm font-medium text-gray-700">関連タスク</h3>
      <ul
        data-testid="links-section-linked"
        aria-label="関連リンク先（このタスクから他のタスクへのリンク）"
        className="flex flex-col gap-1 text-sm text-gray-700"
      >
        {props.task.links.linkedFilePaths.map((p) => (
          <li
            key={p}
            data-testid={`links-section-linked-${p}`}
            className="truncate"
          >
            {p}
          </li>
        ))}
      </ul>
      <ul
        data-testid="links-section-reverse"
        aria-label="関連リンク元（他のタスクからこのタスクへの逆リンク）"
        className="flex flex-col gap-1 text-sm text-gray-500"
      >
        {props.task.links.reverseLinkedFilePaths.map((p) => (
          <li
            key={p}
            data-testid={`links-section-reverse-${p}`}
            className="truncate"
          >
            {p}
          </li>
        ))}
      </ul>
      {isOpen ? (
        <TaskSelect
          tasks={candidates}
          value={null}
          onChange={handleSelect}
          onClose={() => setIsOpen(false)}
          placeholder="タスクを検索..."
          autoFocus
          testIdPrefix="links-section"
        />
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          disabled={isBusy}
          data-testid="links-section-add-button"
          className="self-start rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        >
          + リンク追加
        </button>
      )}
    </section>
  );
};
