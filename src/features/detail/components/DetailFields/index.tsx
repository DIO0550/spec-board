import { createContext, type ReactNode, useContext } from "react";
import { DueBadge } from "@/components/DueBadge";
import type { UseChildTasksResult } from "@/features/detail/hooks/useChildTasks";
import type { DetailFieldHandlers } from "@/features/detail/hooks/useDetailFieldHandlers";
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

/**
 * 詳細フィールド群が共有する横断データ。表示対象タスク・カラム一覧・
 * 編集ハンドラ（status/priority/label）の3つに限定する（意味的に一貫した塊）。
 * フィールド固有のデータ（SubIssue / Links）は各サブ部品の props で受ける。
 */
type DetailFieldsContextValue = {
  /** 表示するタスク */
  task: Task;
  /** 選択肢となるカラム一覧 */
  columns: Column[];
  /** ステータス/優先度/ラベルの編集ハンドラ */
  handlers: DetailFieldHandlers;
};

const DetailFieldsContext = createContext<DetailFieldsContextValue | null>(
  null,
);

/**
 * DetailFields の context を取得する。Root（{@link DetailFields}）の外で
 * サブ部品を使うと null になるため、その場合は例外で誤用を知らせる。
 * @returns context 値
 * @throws Root の外で呼ばれた場合
 */
const useDetailFieldsContext = (): DetailFieldsContextValue => {
  const ctx = useContext(DetailFieldsContext);
  if (ctx === null) {
    throw new Error(
      "DetailFields.* は <DetailFields> の子としてのみ使用できます",
    );
  }
  return ctx;
};

/** DetailFields（Root）の Props */
export type DetailFieldsProps = {
  /** 表示するタスク */
  task: Task;
  /** 選択肢となるカラム一覧 */
  columns: Column[];
  /** ステータス/優先度/ラベルの編集ハンドラ */
  handlers: DetailFieldHandlers;
  /** 並べるフィールドのサブ部品（DetailFields.StatusPriority 等） */
  children: ReactNode;
};

/**
 * 詳細フィールド群のコンテナ（Compound パターンの Root）。
 * 横断データ（task / columns / handlers）を context で供給し、配置は呼び出し側が
 * サブ部品（{@link DetailFieldsStatusPriority} / {@link DetailFieldsLabels} /
 * {@link DetailFieldsSubIssue} / {@link DetailFieldsLinks}）を並べて決める。
 * 余計な wrapper は作らず Fragment で子を並べる（DOM 並びを呼び出し側に委ねる）。
 * @param props - {@link DetailFieldsProps}
 * @returns フィールド群コンテナ
 */
const DetailFieldsRoot = ({
  task,
  columns,
  handlers,
  children,
}: DetailFieldsProps) => {
  return (
    <DetailFieldsContext.Provider value={{ task, columns, handlers }}>
      {children}
    </DetailFieldsContext.Provider>
  );
};

/**
 * ステータス + 優先度フィールド。横断 context から task / columns / handlers を読む。
 * @returns Status/Priority 行
 */
const DetailFieldsStatusPriority = () => {
  const { task, columns, handlers } = useDetailFieldsContext();
  return (
    <div className="flex gap-4">
      <StatusSelect
        value={task.status}
        columns={columns}
        onChange={handlers.onStatusChange}
      />
      <PrioritySelect
        value={task.priority}
        onChange={handlers.onPriorityChange}
      />
      <DueBadge due={task.due} />
    </div>
  );
};

/**
 * ラベルフィールド。横断 context から task / handlers を読む。
 * @returns ラベルエディタ
 */
const DetailFieldsLabels = () => {
  const { task, handlers } = useDetailFieldsContext();
  return (
    <LabelEditor
      labels={task.labels}
      onAdd={handlers.onLabelAdd}
      onRemove={handlers.onLabelRemove}
    />
  );
};

/** SubIssue フィールドの Props（サブIssue 固有データのみ） */
export type DetailFieldsSubIssueProps = {
  /** 子タスク解決結果（useChildTasks の戻り値） */
  childInfo: UseChildTasksResult;
  /** リンク切れと判定された子タスクの path 集合 */
  brokenChildPaths: ReadonlySet<string>;
  /**
   * サブIssue 追加ハンドラ。
   * @param parentFilePath - 親タスクのファイルパス
   */
  onAddSubIssue: (parentFilePath: string) => void;
  /**
   * 子タスククリック時のハンドラ。
   * @param taskId - クリックされた子タスクの id
   */
  onChildClick?: (taskId: string) => void;
};

/**
 * サブIssue 進捗フィールド。親タスクは横断 context から読み、
 * サブIssue 固有のデータ（子タスク・ハンドラ）は props で受ける。
 * @param props - {@link DetailFieldsSubIssueProps}
 * @returns サブIssue セクション
 */
const DetailFieldsSubIssue = (props: DetailFieldsSubIssueProps) => {
  const { task } = useDetailFieldsContext();
  const { childInfo, brokenChildPaths, onAddSubIssue, onChildClick } = props;
  return (
    <SubIssueSection
      parentTask={task}
      childTasks={childInfo.childTasks}
      descendantTasks={childInfo.descendantTasks}
      doneColumn={childInfo.effectiveDoneColumn}
      onAddSubIssue={onAddSubIssue}
      onChildClick={onChildClick}
      brokenChildPaths={brokenChildPaths}
    />
  );
};

/**
 * 下書きフィールド。draft タスクのときのみ「下書き」バッジと「下書きを解除」ボタンを
 * 表示し、クリックで `handlers.onChangeDraft(false)` を呼ぶ。非 draft 時は何も描画しない。
 * @returns 下書き表示・解除 UI（非 draft 時は null）
 */
const DetailFieldsDraft = () => {
  const { task, handlers } = useDetailFieldsContext();
  if (!task.draft) {
    return null;
  }
  return (
    <div className="flex items-center gap-2" data-testid="detail-draft-field">
      <span
        data-testid="detail-draft-badge"
        className="inline-flex items-center rounded bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600"
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

/** Links フィールドの Props（リンク固有データのみ） */
export type DetailFieldsLinksProps = {
  /** 全タスク一覧（リンク先解決に利用） */
  allTasks: Task[];
  /** 親タスクの filePath（無ければ null） */
  parentFilePath: string | null;
  /** 子タスクの filePath 一覧 */
  childrenFilePaths: string[];
  /** リンク切れと判定された links の path 集合 */
  brokenLinkPaths: ReadonlySet<string>;
  /** リンク切れと判定された reverseLinks の path 集合 */
  brokenReverseLinkPaths: ReadonlySet<string>;
  /**
   * リンク追加ハンドラ。
   * @param sourceFilePath - リンク元 filePath
   * @param targetFilePath - リンク先 filePath
   * @returns invoke 結果
   */
  onAddLink: (
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
  /**
   * リンククリック時のハンドラ。
   * @param taskId - クリックされたタスクの id
   */
  onLinkClick?: (taskId: string) => void;
};

/**
 * リンクフィールド。表示対象タスクは横断 context から読み、
 * リンク固有のデータ（全タスク・path・ハンドラ）は props で受ける。
 * `key={links-${task.id}}` で task 切替時に内部 state をリセットする。
 * @param props - {@link DetailFieldsLinksProps}
 * @returns リンクセクション
 */
const DetailFieldsLinks = (props: DetailFieldsLinksProps) => {
  const { task } = useDetailFieldsContext();
  const {
    allTasks,
    parentFilePath,
    childrenFilePaths,
    brokenLinkPaths,
    brokenReverseLinkPaths,
    onAddLink,
    onRemoveLink,
    onLinkClick,
  } = props;
  return (
    <LinksSection
      key={`links-${task.id}`}
      task={task}
      allTasks={allTasks}
      parentFilePath={parentFilePath}
      childrenFilePaths={childrenFilePaths}
      onAddLink={onAddLink}
      onRemoveLink={onRemoveLink ?? noopRemoveLink}
      onLinkClick={onLinkClick}
      brokenLinkPaths={brokenLinkPaths}
      brokenReverseLinkPaths={brokenReverseLinkPaths}
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
 * 詳細フィールド群（Compound コンポーネント）。
 * `<DetailFields task columns handlers>` の子として
 * `DetailFields.StatusPriority` / `.Labels` / `.SubIssue` / `.Links` を並べて使う。
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
