import type { BrokenLinkSet } from "@/domains/broken-link";
import type { Priority } from "@/domains/priority";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";
import type { Result } from "@/utils/result";
import { Result as ResultDomain } from "@/utils/result";
import { LabelEditor } from "../LabelEditor";
import { LinksSection } from "../LinksSection";
import { PrioritySelect } from "../PrioritySelect";
import { StatusSelect } from "../StatusSelect";
import { SubIssueSection } from "../SubIssueSection";

/**
 * `onRemoveLink` 未指定時に LinksSection に渡す no-op fallback。
 * 既存呼出元が `onRemoveLink` を渡し忘れても forward 削除の × ボタンの click が
 * 型エラーで落ちないようにする。戻り値は `Result.err(undefined)` だが LinksSection の
 * `useRemoveLink` は Result を捨てるため UI には影響しない。
 * @returns 常に `Result.err(undefined)`
 */
const noopRemoveLink = async (): Promise<Result<Task, unknown>> =>
  ResultDomain.err(undefined);

/** フィールド塊（Status/Priority/Labels/SubIssue/Links）の Props */
export type DetailFieldsProps = {
  /** 表示するタスク */
  task: Task;
  /** 選択肢となるカラム一覧 */
  columns: Column[];
  /** 全タスク一覧。SubIssue / Links セクションの解決に利用する */
  allTasks?: Task[];
  /** 直接の子タスク（コンテナで解決済み） */
  childTasks: readonly Task[];
  /** 全子孫タスク（コンテナで解決済み） */
  descendantTasks: readonly Task[];
  /** 完了として扱うカラム名（コンテナで解決済み。SubIssue 完了判定に使用） */
  effectiveDoneColumn: string;
  /** 親タスク（無ければ null） */
  parentTask: Task | null;
  /** リンク切れ判定結果 */
  brokenLinks: BrokenLinkSet;
  /**
   * ステータス変更ハンドラ。
   * @param status - 新しいステータス
   */
  onStatusChange: (status: string) => void;
  /**
   * 優先度変更ハンドラ。
   * @param priority - 新しい優先度
   */
  onPriorityChange: (priority: Priority | undefined) => void;
  /**
   * ラベル追加ハンドラ。
   * @param label - 追加するラベル
   */
  onLabelAdd: (label: string) => void;
  /**
   * ラベル削除ハンドラ。
   * @param label - 削除するラベル
   */
  onLabelRemove: (label: string) => void;
  /**
   * サブIssue 追加ハンドラ。
   * @param parentFilePath - 親タスクのファイルパス
   */
  onAddSubIssue?: (parentFilePath: string) => void;
  /**
   * 別タスクへ表示対象を切り替えるハンドラ。
   * @param taskId - 切り替え先タスクの id
   */
  onSelectTask?: (taskId: string) => void;
  /**
   * リンク追加ハンドラ。
   * @param sourceFilePath - リンク元 filePath
   * @param targetFilePath - リンク先 filePath
   * @returns invoke 結果
   */
  onAddLink?: (
    sourceFilePath: string,
    targetFilePath: string,
  ) => Promise<Result<Task, unknown>>;
  /**
   * リンク削除ハンドラ。
   * @param sourceFilePath - リンク元 filePath
   * @param targetFilePath - リンク先 filePath
   * @returns invoke 結果
   */
  onRemoveLink?: (
    sourceFilePath: string,
    targetFilePath: string,
  ) => Promise<Result<Task, unknown>>;
};

/**
 * 詳細のフィールド塊。Status/Priority + Labels + SubIssue 進捗 + Links を
 * 追加の wrapper を作らず Fragment で縦に並べて描画する（DetailPanel body の
 * 現行 DOM 並びと一致させるため）。削除ボタン・Markdown 本文・タイトルは含まない。
 * DetailPanel の body と DetailScreen の右サイドバー（PropertiesSidebar 内）で共有する。
 * @param props - {@link DetailFieldsProps}
 * @returns フィールド塊要素
 */
export const DetailFields = (props: DetailFieldsProps) => {
  const {
    task,
    columns,
    allTasks,
    childTasks,
    descendantTasks,
    effectiveDoneColumn,
    parentTask,
    brokenLinks,
    onStatusChange,
    onPriorityChange,
    onLabelAdd,
    onLabelRemove,
    onAddSubIssue,
    onSelectTask,
    onAddLink,
    onRemoveLink,
  } = props;

  return (
    <>
      <div className="flex gap-4">
        <StatusSelect
          value={task.status}
          columns={columns}
          onChange={onStatusChange}
        />
        <PrioritySelect value={task.priority} onChange={onPriorityChange} />
      </div>
      <LabelEditor
        labels={task.labels}
        onAdd={onLabelAdd}
        onRemove={onLabelRemove}
      />
      {onAddSubIssue && allTasks !== undefined && (
        <SubIssueSection
          parentTask={task}
          childTasks={childTasks}
          descendantTasks={descendantTasks}
          doneColumn={effectiveDoneColumn}
          onAddSubIssue={onAddSubIssue}
          onChildClick={onSelectTask}
          brokenChildPaths={brokenLinks.children}
        />
      )}
      {onAddLink !== undefined && allTasks !== undefined && (
        // key=links-${task.id}: task 切替で LinksSection をリマウントし
        // popover の isOpen / 検索 query 等の内部 state を確実にリセットする。
        <LinksSection
          key={`links-${task.id}`}
          task={task}
          allTasks={allTasks}
          parentFilePath={parentTask?.filePath ?? null}
          childrenFilePaths={childTasks.map((t) => t.filePath)}
          onAddLink={onAddLink}
          onRemoveLink={onRemoveLink ?? noopRemoveLink}
          onLinkClick={onSelectTask}
          brokenLinkPaths={brokenLinks.links}
          brokenReverseLinkPaths={brokenLinks.reverseLinks}
        />
      )}
    </>
  );
};
