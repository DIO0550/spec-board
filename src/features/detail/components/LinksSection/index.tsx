import { useMemo, useState } from "react";
import { BrokenRefLabel } from "@/components/BrokenRefLabel";
import { TaskSelect } from "@/components/TaskSelect";
import { TaskLinks } from "@/domains/task-links";
import { linkReferencesTaskPath } from "@/domains/task-path";
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
   * forward 削除のみが対象。reverse 行には削除ボタンを表示しない。
   * @param sourceFilePath リンク元（md が書き換わる側）の filePath
   * @param targetFilePath リンク先の filePath
   * @returns invoke 結果
   */
  readonly onRemoveLink: (
    sourceFilePath: string,
    targetFilePath: string,
  ) => Promise<Result<Task, unknown>>;
  /**
   * リンク行（forward / reverse 両方）のクリックで発火するコールバック。
   * クリックされたリンク先タスクの filePath（= id）が渡される。
   * 未指定時は行 button を disabled にする。
   */
  readonly onLinkClick?: (taskId: string) => void;
  /**
   * forward link でリンク切れと判定された raw path 集合。
   * 該当行は WarningIcon + 「リンク切れ」テキスト + 取消線スタイル付き path 表示になる。
   */
  readonly brokenLinkPaths?: ReadonlySet<string>;
  /**
   * reverse link でリンク切れと判定された raw path 集合。
   * 該当行は WarningIcon + 「リンク切れ」テキスト + 取消線スタイル付き path 表示になる。
   */
  readonly brokenReverseLinkPaths?: ReadonlySet<string>;
};

/**
 * DetailPanel の関連タスクセクション。`linkedFilePaths` / `reverseLinkedFilePaths`
 * を一覧表示し、`+ リンク追加` で候補から選択、forward (linked) 行末尾の × ボタン
 * で削除する。reverse 行は読み取り専用で削除 UI を持たない。
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
  const isBusyAny = isBusyAdd || isBusyRemoveForward;
  const isLinkClickDisabled = props.onLinkClick === undefined;

  // linkedFilePaths は frontmatter 由来で `./tasks/b.md` / `tasks\\b.md` 等の表記揺れを
  // 保持する。`selectTaskOutcome` は `Task.id`（canonical）一致でのみ解決するため、
  // 行クリック時は allTasks から表記揺れを吸収して canonical id に解決してから渡す。
  // 解決できない（壊れたリンク）場合は raw 値を渡し、上流 selectTaskOutcome の no-op に委ねる。
  const handleLinkClick = (linkPath: string): void => {
    const resolved = props.allTasks.find((t) =>
      linkReferencesTaskPath(linkPath, t.filePath),
    );
    props.onLinkClick?.(resolved?.id ?? linkPath);
  };

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
        {props.task.links.linkedFilePaths.map((p, i) => {
          const isBroken = props.brokenLinkPaths?.has(p) ?? false;
          if (isBroken) {
            return (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: linkedFilePaths は payload 由来の raw 配列で重複を含み得るため、index を含めて React key 衝突を防ぐ
                key={`${i}-${p}`}
                data-testid={`links-section-linked-${i}`}
                data-path={p}
                data-broken="true"
                className="flex items-center justify-between gap-2"
              >
                <span className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1">
                  <BrokenRefLabel
                    rawPath={p}
                    pathTestId={`links-section-linked-broken-${i}`}
                  />
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveForward(p)}
                  disabled={isBusyAny}
                  aria-label="リンクを削除"
                  data-testid={`links-section-linked-remove-${i}`}
                  className="shrink-0 rounded px-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                >
                  ×
                </button>
              </li>
            );
          }
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: linkedFilePaths は payload 由来の raw 配列で重複を含み得るため、index を含めて React key 衝突を防ぐ
              key={`${i}-${p}`}
              data-testid={`links-section-linked-${i}`}
              data-path={p}
              className="flex items-center justify-between gap-2"
            >
              <button
                type="button"
                onClick={() => handleLinkClick(p)}
                disabled={isLinkClickDisabled}
                data-testid={`links-section-linked-navigate-${i}`}
                data-path={p}
                className="min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left hover:bg-gray-100 disabled:cursor-default disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                {p}
              </button>
              <button
                type="button"
                onClick={() => handleRemoveForward(p)}
                disabled={isBusyAny}
                aria-label="リンクを削除"
                data-testid={`links-section-linked-remove-${i}`}
                data-path={p}
                className="shrink-0 rounded px-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <ul
        data-testid="links-section-reverse"
        aria-label="関連リンク元（他のタスクからこのタスクへの逆リンク）"
        className="flex flex-col gap-1 text-sm text-gray-500"
      >
        {props.task.links.reverseLinkedFilePaths.map((p, i) => {
          const isBroken = props.brokenReverseLinkPaths?.has(p) ?? false;
          if (isBroken) {
            return (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: reverseLinkedFilePaths は payload 由来の raw 配列で重複を含み得るため、index を含めて React key 衝突を防ぐ
                key={`${i}-${p}`}
                data-testid={`links-section-reverse-${i}`}
                data-path={p}
                data-broken="true"
                className="flex items-center gap-2"
              >
                <span className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1">
                  <BrokenRefLabel
                    rawPath={p}
                    pathTestId={`links-section-reverse-broken-${i}`}
                  />
                </span>
              </li>
            );
          }
          return (
            <li
              key={p}
              data-testid={`links-section-reverse-${i}`}
              data-path={p}
              className="flex items-center gap-2"
            >
              <button
                type="button"
                onClick={() => handleLinkClick(p)}
                disabled={isLinkClickDisabled}
                data-testid={`links-section-reverse-navigate-${i}`}
                data-path={p}
                className="min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left hover:bg-gray-100 disabled:cursor-default disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                {p}
              </button>
            </li>
          );
        })}
      </ul>
      {isOpen ? (
        <TaskSelect
          tasks={candidates}
          value={null}
          onChange={handleSelect}
          onClose={() => setIsOpen(false)}
          placeholder="タスクを検索..."
          autoFocus
          disabled={isBusyAny}
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
