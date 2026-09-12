import type { ReactNode } from "react";
import { DueBadge } from "@/components/DueBadge";
import { LabelsField } from "@/components/fields/LabelsField";
import { PriorityField } from "@/components/fields/PriorityField";
import { StatusField } from "@/components/fields/StatusField";
import { useDetail } from "@/features/detail/providers/DetailProvider";
import type { Task } from "@/types/task";
import type { Result } from "@/utils/result";
import { Result as ResultDomain } from "@/utils/result";
import { LinksSection } from "../LinksSection";
import { SubIssueSection } from "../SubIssueSection";

/**
 * `onRemoveLink` 未指定時に LinksSection に渡す no-op fallback。
 * 既存呼出元が `onRemoveLink` を渡し忘れても forward 削除の × ボタンの click が
 * 型エラーで落ちないようにする。戻り値は `Result.err(undefined)` だが LinksSection は
 * 削除 invoke の Result を捨てるため UI には影響しない。
 * @returns 常に `Result.err(undefined)`
 */
const noopRemoveLink = async (): Promise<Result<Task, unknown>> =>
  ResultDomain.err(undefined);

/** DetailFields（Root）の Props */
export type DetailFieldsProps = {
  /** 並べるフィールドのサブ部品（DetailFields.StatusPriority 等） */
  children: ReactNode;
};

/**
 * 詳細フィールド群のコンテナ（Compound パターンの Root）。
 * 横断データは {@link useDetail} から各サブ部品が直接読むため、Root は配置を
 * 呼び出し側に委ねる Fragment コンテナとしてのみ振る舞う。
 * @param props - {@link DetailFieldsProps}
 * @returns フィールド群コンテナ
 */
const DetailFieldsRoot = ({ children }: DetailFieldsProps) => <>{children}</>;

/**
 * ステータス + 優先度フィールド。
 * @returns Status/Priority 行
 */
const DetailFieldsStatusPriority = () => {
  const { task, columns, handlers } = useDetail();
  return (
    <section className="grid grid-cols-1 gap-3 border-b border-border px-[18px] py-4">
      <StatusField
        value={task.status}
        columns={columns}
        onChange={handlers.onStatusChange}
      />
      <PriorityField
        value={task.priority}
        onChange={handlers.onPriorityChange}
      />
      <DueBadge due={task.due} />
    </section>
  );
};

/**
 * ラベルフィールド。候補は App の唯一の取得点（useLabels）由来で、このフィールド自体は
 * 取得を行わない。候補が空配列のときは popover 内での新規作成のみ可能となる。
 * @returns ラベル選択フィールド
 */
const DetailFieldsLabels = () => {
  const { task, handlers, labelSuggestions } = useDetail();
  return (
    <div className="border-b border-border px-[18px] py-4">
      <LabelsField
        label="ラベル"
        value={task.labels}
        suggestions={labelSuggestions}
        onChange={handlers.onLabelsChange}
        data-testid="detail-labels"
      />
    </div>
  );
};

/**
 * 下書きフィールド。draft タスクのときのみ「下書き」バッジと「下書きを解除」ボタンを
 * 表示し、クリックで `handlers.onChangeDraft(false)` を呼ぶ。非 draft 時は何も描画しない。
 * @returns 下書き表示・解除 UI（非 draft 時は null）
 */
const DetailFieldsDraft = () => {
  const { task, handlers } = useDetail();
  if (!task.draft) {
    return null;
  }
  return (
    <div
      className="flex items-center gap-2 border-b border-border px-[18px] py-4"
      data-testid="detail-draft-field"
    >
      <span
        data-testid="detail-draft-badge"
        className="inline-flex items-center rounded-full border border-border bg-surface-muted px-2 py-1 text-[10.5px] font-medium text-muted"
      >
        下書き
      </span>
      <button
        type="button"
        onClick={() => handlers.onChangeDraft(false)}
        className="rounded border border-border px-2 py-0.5 text-xs text-foreground hover:border-accent"
        data-testid="detail-draft-clear"
      >
        下書きを解除
      </button>
    </div>
  );
};

/**
 * サブIssue 進捗フィールド。`onAddSubIssue` と `allTasks` の両方が揃っているときだけ描画する
 * （従来 PropertiesSidebar にあった表示条件をここに移した）。
 * @returns サブIssue セクション（描画条件を満たさなければ null）
 */
const DetailFieldsSubIssue = () => {
  const {
    task,
    allTasks,
    childInfo,
    brokenLinks,
    onAddSubIssue,
    onSelectTask,
  } = useDetail();
  if (onAddSubIssue === undefined || allTasks === undefined) {
    return null;
  }
  return (
    <SubIssueSection
      parentTask={task}
      childTasks={childInfo.childTasks}
      subIssueCounts={childInfo.subIssueCounts}
      isDone={childInfo.isDone}
      onAddSubIssue={onAddSubIssue}
      onChildClick={onSelectTask}
      brokenChildPaths={brokenLinks.children}
    />
  );
};

/**
 * リンクフィールド。`onAddLink` と `allTasks` の両方が揃っているときだけ描画する。
 * `key={links-${task.id}}` で task 切替時に内部 state をリセットする。
 * @returns リンクセクション（描画条件を満たさなければ null）
 */
const DetailFieldsLinks = () => {
  const {
    task,
    allTasks,
    parentTask,
    childInfo,
    brokenLinks,
    onAddLink,
    onRemoveLink,
    onSelectTask,
  } = useDetail();
  if (onAddLink === undefined || allTasks === undefined) {
    return null;
  }
  return (
    <LinksSection
      key={`links-${task.id}`}
      task={task}
      allTasks={allTasks}
      parentFilePath={parentTask?.filePath ?? null}
      childrenFilePaths={childInfo.childTasks.map((t) => t.filePath)}
      onAddLink={onAddLink}
      onRemoveLink={onRemoveLink ?? noopRemoveLink}
      onLinkClick={onSelectTask}
      brokenLinkPaths={brokenLinks.links}
      brokenReverseLinkPaths={brokenLinks.reverseLinks}
    />
  );
};

/** Compound コンポーネント本体（Root + サブ部品の名前空間） */
type DetailFieldsComponent = ((props: DetailFieldsProps) => ReactNode) & {
  StatusPriority: typeof DetailFieldsStatusPriority;
  Labels: typeof DetailFieldsLabels;
  Draft: typeof DetailFieldsDraft;
  SubIssue: typeof DetailFieldsSubIssue;
  Links: typeof DetailFieldsLinks;
};

/**
 * 詳細フィールド群（Compound コンポーネント）。`<DetailProvider>` の配下で
 * `<DetailFields>` の子として `DetailFields.StatusPriority` / `.Labels` / `.Draft` /
 * `.SubIssue` / `.Links` を並べて使う。
 */
export const DetailFields: DetailFieldsComponent = Object.assign(
  DetailFieldsRoot,
  {
    StatusPriority: DetailFieldsStatusPriority,
    Labels: DetailFieldsLabels,
    Draft: DetailFieldsDraft,
    SubIssue: DetailFieldsSubIssue,
    Links: DetailFieldsLinks,
  },
);
