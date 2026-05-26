import { useMemo, useState } from "react";
import { TaskSelect } from "@/components/TaskSelect";
import { TaskLinks } from "@/domains/task-links";
import { useAddLink } from "@/features/detail/hooks/useAddLink";
import { useRemoveLink } from "@/features/detail/hooks/useRemoveLink";
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
  /**
   * リンク削除コールバック。source filePath / target filePath を受け取る。
   * forward 削除では source=表示中タスク、reverse 削除では source=相手タスクになる。
   * @param sourceFilePath リンク元（md が書き換わる側）の filePath
   * @param targetFilePath リンク先の filePath
   * @returns invoke 結果
   */
  readonly onRemoveLink: (
    sourceFilePath: string,
    targetFilePath: string,
  ) => Promise<Result<Task, unknown>>;
};

/**
 * DetailPanel の関連タスクセクション。`linkedFilePaths` / `reverseLinkedFilePaths`
 * を一覧表示し、`+ リンク追加` で候補から選択、各リンク行末尾の × ボタンで削除する。
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
  const { isBusy: isBusyAdd, addLink } = useAddLink({
    onAddLink: (target) => props.onAddLink(sourceFilePath, target),
  });

  // forward link 用: source=表示中タスク、target=相手
  const { isBusy: isBusyRemoveForward, removeLink: removeForward } =
    useRemoveLink({
      onRemoveLink: (target) => props.onRemoveLink(sourceFilePath, target),
    });
  // reverse link 用: source=相手タスク、target=表示中タスク（IPC の source/target が反転）
  const { isBusy: isBusyRemoveReverse, removeLink: removeReverse } =
    useRemoveLink({
      onRemoveLink: (otherSource) =>
        props.onRemoveLink(otherSource, sourceFilePath),
    });
  const isBusyRemove = isBusyRemoveForward || isBusyRemoveReverse;
  const isBusyAny = isBusyAdd || isBusyRemove;

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

  /**
   * forward link 行の × クリックハンドラ。
   * @param target 削除対象の link 先 filePath
   */
  const handleRemoveForward = (target: string): void => {
    void removeForward(target).catch(() => undefined);
  };

  /**
   * reverse link 行の × クリックハンドラ。
   * @param otherSource 削除対象の link 元 filePath（相手タスク）
   */
  const handleRemoveReverse = (otherSource: string): void => {
    void removeReverse(otherSource).catch(() => undefined);
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
            className="flex items-center justify-between gap-2"
          >
            <span className="min-w-0 flex-1 truncate">{p}</span>
            <button
              type="button"
              onClick={() => handleRemoveForward(p)}
              disabled={isBusyAny}
              aria-label="リンクを削除"
              data-testid={`links-section-linked-remove-${p}`}
              className="shrink-0 rounded px-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
            >
              ×
            </button>
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
            className="flex items-center justify-between gap-2"
          >
            <span className="min-w-0 flex-1 truncate">{p}</span>
            <button
              type="button"
              onClick={() => handleRemoveReverse(p)}
              disabled={isBusyAny}
              aria-label="リンクを削除"
              data-testid={`links-section-reverse-remove-${p}`}
              className="shrink-0 rounded px-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
            >
              ×
            </button>
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
          disabled={isBusyAny}
          data-testid="links-section-add-button"
          className="self-start rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        >
          + リンク追加
        </button>
      )}
    </section>
  );
};
