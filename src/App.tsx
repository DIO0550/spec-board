import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type LiveAnnouncement, LiveRegion } from "@/components/LiveRegion";
import { ToastContainer } from "@/components/ToastContainer";
import {
  buildTasksByNormalizedPath,
  countTasksWithBrokenLink,
} from "@/domains/broken-link";
import { LabelRegistry } from "@/domains/label-registry";
import { Milestone } from "@/domains/milestone";
import { countTasksWithParseError } from "@/domains/parse-error";
import { selectTaskOutcome } from "@/domains/task-selection";
import { type LabelsResource, useLabels } from "@/hooks/useLabels";
import { type MilestonesResource, useMilestones } from "@/hooks/useMilestones";
import {
  type UseRecentProjectsResult,
  useRecentProjects,
} from "@/hooks/useRecentProjects";
import { useToasts } from "@/hooks/useToasts";
import { type OrphanStrategy, registerToastSink } from "@/lib/tauri";
import {
  type AppView,
  AppViewProvider,
  useAppView,
} from "@/providers/AppViewProvider";
import { resolveCloseTarget } from "@/providers/AppViewProvider/resolveCloseTarget";
import type { UseToastsResult } from "@/types/toast";
import { basenameOf } from "@/utils/path";
import {
  BoardWorkspace,
  EmptyState,
  HeaderBar,
  type MoveTaskParams,
  PROJECT_SWITCHED_MESSAGE,
  type ProjectError,
  type ProjectLoadedEvent,
  type ProjectState,
  projectErrorMessage,
  type ReorderColumnsEvent,
  type UseProjectResult,
  useProject,
  wasNotifiedByInvokeWrapped,
} from "./features/board";
import { DetailScreen } from "./features/detail";
import { MilestoneViewScreen } from "./features/milestoneView";
import {
  SettingsScreen,
  type UseMilestoneMutationsResult,
  useMilestoneMutations,
} from "./features/settings";
import { AppSidebar, ThemeProvider } from "./features/shell";
import {
  TaskCreateScreen,
  type TaskFormValues,
  type UseTaskCreateResult,
  useTaskCreate,
} from "./features/task-form";
import type { Column } from "./types/column";
import type { Task } from "./types/task";

/** State の表示用 ProjectData を返すための内部型。 */
type DisplayableData = {
  readonly tasks: Task[];
  readonly columns: Column[];
  readonly doneColumn?: string;
};

/**
 * 作成画面（全画面 create）の開閉状態と親コンテキストを表す判別可能 union。
 * 旧来の status / parent / subIssueParentPath の 3 state を 1 つに統合し、
 * 「親だけ残った作成画面」のような不正な組み合わせを表現不能にする。
 *
 * - `null`: 作成画面を閉じている。
 * - `{ kind: "normal" }`: board の「+」起点の通常作成。親は未指定で候補は tasks 全件。
 * - `{ kind: "subIssue", parentPath }`: detail のサブIssue 追加起点。親が自動セットされ、
 *   候補は親 1 件に絞られ UI 上 read-only になる。
 */
type CreateModalState =
  | { readonly kind: "normal"; readonly status: string }
  | {
      readonly kind: "subIssue";
      readonly status: string;
      readonly parentPath: string;
    }
  | null;

/**
 * 表示可能な ProjectData を返す。
 * - loaded: state.data
 * - それ以外: null
 *
 * @param state useProject の現在 state
 * @returns 表示用 data または null
 */
const displayableDataOf = (state: ProjectState): DisplayableData | null => {
  if (state.kind === "loaded") {
    return state.data;
  }
  return null;
};

/**
 * 表示用 tasks を返す。
 *
 * @param state useProject の現在 state
 * @returns 派生タスク配列
 */
const tasksOf = (state: ProjectState): Task[] =>
  displayableDataOf(state)?.tasks ?? [];

/**
 * 表示用 columns を返す。
 *
 * @param state useProject の現在 state
 * @returns 派生カラム配列
 */
const columnsOf = (state: ProjectState): Column[] =>
  displayableDataOf(state)?.columns ?? [];

/**
 * 表示用 doneColumn を返す。
 *
 * @param state useProject の現在 state
 * @returns 派生 doneColumn
 */
const doneColumnOf = (state: ProjectState): string | undefined =>
  displayableDataOf(state)?.doneColumn;

/**
 * 現在選択中のタスクを解決する。selectedTaskId が tasks に存在すればそれを返し、
 * 削除楽観 dispatch 中（tasks から消えている間）は pendingDeleteTask snapshot を
 * fallback として返す（rollback で tasks に戻れば自然と tasks 側へ切り替わる）。
 * @param selectedTaskId 選択中タスクの ID（未選択は null）
 * @param tasks 現在のタスク一覧
 * @param pendingDeleteTask 削除楽観中の snapshot（無ければ null）
 * @returns 選択中タスク、または解決不能 / 未選択なら null
 */
const resolveSelectedTask = (
  selectedTaskId: string | null,
  tasks: Task[],
  pendingDeleteTask: Task | null,
): Task | null => {
  if (selectedTaskId === null) {
    return null;
  }
  const found = tasks.find((t) => t.id === selectedTaskId);
  if (found !== undefined) {
    return found;
  }
  if (pendingDeleteTask !== null && pendingDeleteTask.id === selectedTaskId) {
    return pendingDeleteTask;
  }
  return null;
};

/**
 * `AppShellBody` に渡す依存。AppShell が所有する state / setters / 派生値 /
 * 非 navigate ハンドラをまとめて渡し、AppShellBody は navigate を使う合成ハンドラ
 * と JSX のみを担当する。Provider key remount による view リセットの責務を
 * view 単独に閉じるため、ここで列挙する state は AppShell に残す（AppShellBody
 * 側に持つと Provider remount で巻き込まれる）。
 */
type AppShellBodyProps = {
  /** トースト表示関数（成功 / 警告 / 失敗の通知用） */
  showToast: UseToastsResult["showToast"];
  /** 最近開いたプロジェクト一覧 */
  recentProjects: UseRecentProjectsResult;
  /** project lifecycle / CRUD ハンドル一式 */
  project: UseProjectResult;
  /** タスク作成サブミット（useTaskCreate の submit） */
  submitCreateTask: UseTaskCreateResult["submit"];
  /** loaded 時のみ非 null になる project path */
  loadedPath: string | null;
  /** 現在表示中の派生 task 配列 */
  tasks: Task[];
  /** 現在表示中の派生 column 配列 */
  columns: Column[];
  /** 現在の doneColumn 名（未設定なら undefined） */
  doneColumn: string | undefined;
  /** filePath 正規化済 key → task の lookup */
  tasksByNormalizedPath: ReadonlyMap<string, Task>;
  /** path 末尾セグメント（sidebar / header 表示用） */
  projectName: string | undefined;
  /** state 由来の loaded path（loaded 以外は null） */
  displayedPath: string | null;
  /** ボード / マイルストーン画面で使う milestone リソース */
  milestonesResource: MilestonesResource;
  /** 設定画面の milestone タブ向け（live usageCounts で上書き済） */
  settingsMilestonesResource: MilestonesResource;
  /** milestone CRUD ハンドル（in-flight ガード共有用に App 直下で 1 つ） */
  milestoneMutations: UseMilestoneMutationsResult;
  /** 設定画面の label タブ向け（live usageCounts で上書き済） */
  settingsLabelsResource: LabelsResource;
  /** 選択中タスクの ID（未選択は null） */
  selectedTaskId: string | null;
  /**
   * selectedTaskId の setter。
   * @param id 設定する task ID（解除は null）
   */
  setSelectedTaskId: (id: string | null) => void;
  /** 削除楽観中の task snapshot（rollback / fallback 用） */
  pendingDeleteTask: Task | null;
  /** 作成画面の開閉と親コンテキストを表す判別 union */
  createModal: CreateModalState;
  /**
   * createModal の setter。
   * @param m 新しい作成画面 state（閉時は null）
   */
  setCreateModal: (m: CreateModalState) => void;
  /** create 画面を閉じたときの戻り先 view */
  returnView: AppView;
  /**
   * returnView の setter。
   * @param v 戻り先 view
   */
  setReturnView: (v: AppView) => void;
  /** create 画面を閉じたときに復元する task ID（不要なら null） */
  returnTaskId: string | null;
  /**
   * returnTaskId の setter。
   * @param id 復元する task ID（不要なら null）
   */
  setReturnTaskId: (id: string | null) => void;
  /** settings → board へ持ち込む 1 回限りのラベル絞り込み（未指定は null） */
  pendingLabelFilter: string | null;
  /**
   * pendingLabelFilter の setter。
   * @param filter 適用するラベル名（解除は null）
   */
  setPendingLabelFilter: (filter: string | null) => void;
  /**
   * allowlist 由来失敗（invokeWrapped が通知済）以外で error toast を出す共通ガード。
   * @param error ProjectError
   * @param message ユーザ向けメッセージ
   */
  showErrorUnlessNotified: (error: ProjectError, message: string) => void;
  /**
   * タスクの部分更新ハンドラ。成功時に success トースト、失敗時はガード越しの error トースト。
   * @param id 対象タスク ID
   * @param updates 部分更新する task 属性
   */
  handleTaskUpdate: (
    id: string,
    updates: Partial<Omit<Task, "id">>,
  ) => Promise<void>;
  /**
   * カラム追加ハンドラ。失敗時は AddColumnButton の editor を維持するため reject する。
   * @param columnName 追加するカラム名
   */
  handleAddColumn: (columnName: string) => Promise<void>;
  /**
   * カラム名変更ハンドラ。失敗時は ColumnHeader の edit mode を維持するため reject する。
   * @param oldName 旧カラム名
   * @param newName 新カラム名
   */
  handleRenameColumn: (oldName: string, newName: string) => Promise<void>;
  /**
   * カラム削除ハンドラ。残タスクは destColumn に移送（指定なしで残タスク 0 件のときのみ削除可）。
   * @param columnName 削除するカラム名
   * @param destColumn 残タスクの移送先カラム名（残 0 件なら undefined）
   */
  handleDeleteColumn: (
    columnName: string,
    destColumn: string | undefined,
  ) => Promise<void>;
  /**
   * タスクのカラム間移動 / 並び替えハンドラ。楽観 dispatch + rollback の announce 込み。
   * @param params 移動パラメータ
   */
  handleTaskDrop: (params: MoveTaskParams) => Promise<void>;
  /**
   * カラム並び替えハンドラ。楽観 dispatch + rollback の announce 込み。
   * @param params from / to のカラム名
   */
  handleColumnReorder: (params: {
    fromColumnName: string;
    toColumnName: string;
  }) => Promise<void>;
  /**
   * タスク間リンク追加ハンドラ（announce 込み）。
   * @param sourceFilePath リンク元 filePath
   * @param targetFilePath リンク先 filePath
   */
  handleAddLink: (
    sourceFilePath: string,
    targetFilePath: string,
  ) => ReturnType<UseProjectResult["addLink"]>;
  /**
   * タスク間リンク削除ハンドラ（announce 込み）。
   * @param sourceFilePath リンク元 filePath
   * @param targetFilePath リンク先 filePath
   */
  handleRemoveLink: (
    sourceFilePath: string,
    targetFilePath: string,
  ) => ReturnType<UseProjectResult["removeLink"]>;
  /**
   * タスク削除ハンドラ。楽観 snapshot 保持 / rollback / announce を含む。
   * @param id 削除対象 task ID
   * @param orphanStrategy 親孤児化処理戦略（指定なしなら default）
   */
  handleTaskDelete: (
    id: string,
    orphanStrategy?: OrphanStrategy,
  ) => Promise<void>;
  /**
   * Sidebar / DetailScreen からの選択タスク変更（navigate しない）。
   * @param taskId 選択する task ID
   */
  handleSelectTask: (taskId: string) => void;
  /** BoardWorkspace 側で pendingLabelFilter を消費し終わった通知 */
  handleLabelFilterApplied: () => void;
};

/**
 * AppShell の return 内部、`<AppViewProvider>` 配下に位置する body。
 * `useAppView()` で view / navigate を取得し、navigate と既存 state を組み合わせる
 * ハンドラ群と JSX を担当する。state / 非 navigate ハンドラは {@link AppShell}
 * 側で所有し props で受け取る（Provider key remount の影響を view 単独に閉じるため）。
 *
 * @param props - {@link AppShellBodyProps}
 * @returns アプリケーションのレイアウト要素
 */
const AppShellBody = ({
  showToast,
  recentProjects: { projects: recentProjects },
  project: { state, openProject, openProjectByPath },
  submitCreateTask,
  loadedPath,
  tasks,
  columns,
  doneColumn,
  tasksByNormalizedPath,
  projectName,
  displayedPath,
  milestonesResource,
  settingsMilestonesResource,
  milestoneMutations,
  settingsLabelsResource,
  selectedTaskId,
  setSelectedTaskId,
  pendingDeleteTask,
  createModal,
  setCreateModal,
  setReturnView,
  setReturnTaskId,
  returnView,
  returnTaskId,
  pendingLabelFilter,
  setPendingLabelFilter,
  showErrorUnlessNotified,
  handleTaskUpdate,
  handleAddColumn,
  handleRenameColumn,
  handleDeleteColumn,
  handleTaskDrop,
  handleColumnReorder,
  handleAddLink,
  handleRemoveLink,
  handleTaskDelete,
  handleSelectTask,
  handleLabelFilterApplied,
}: AppShellBodyProps) => {
  const { view, navigate } = useAppView();

  // settings 表示中に「開く」を押した場合も board に戻してから開く。
  // openProject は成功/失敗/キャンセルを区別しない Promise<void> のため、
  // 押下時点で board へ戻す（board は EmptyState を含め常に有効な画面）。
  const handleOpenClick = useCallback(() => {
    navigate("board");
    openProject();
  }, [navigate, openProject]);

  // サイドバーの最近一覧から指定パスを直接開く（ダイアログを経由しない）。
  const handleOpenProjectPath = useCallback(
    (path: string) => {
      navigate("board");
      openProjectByPath(path);
    },
    [navigate, openProjectByPath],
  );

  const handleLabelUsageClick = useCallback(
    (name: string) => {
      setPendingLabelFilter(name);
      navigate("board");
    },
    [navigate, setPendingLabelFilter],
  );

  const selectedTask = resolveSelectedTask(
    selectedTaskId,
    tasks,
    pendingDeleteTask,
  );

  // detail（全画面ビュー）表示中に選択タスクが消失したら board へ戻す保険。
  // 削除確定後・外部更新でのタスク消失等、same project 内で task が消える経路を
  // 拾う。project 切替時の view リセットは <AppViewProvider key={loadedPath ?? "idle"}>
  // の remount（loaded path → "idle" / 別 path への切替を含む）に委譲済のため、
  // 本 effect は同 project 内のみ走り、stale な task ID で新 project のタスクを誤参照
  // する race は構造的に起きない（task ID は同 project 内で一意）。selectedTaskId も
  // 同時にクリアし、同一 ID 再出現時の DetailScreen 意図せぬ復活を防ぐ。
  useEffect(() => {
    if (view === "detail" && selectedTask === null) {
      navigate("board");
      if (selectedTaskId !== null) {
        setSelectedTaskId(null);
      }
    }
  }, [view, selectedTask, selectedTaskId, navigate, setSelectedTaskId]);

  // カードクリックは選択 + detail（全画面2ペイン）への即遷移を併発する。
  // board 上にスライドパネルを重ねる挙動は廃止し、詳細は detail 区分へ一本化する。
  const handleTaskClick = useCallback(
    (taskId: string) => {
      setSelectedTaskId(taskId);
      navigate("detail");
    },
    [navigate, setSelectedTaskId],
  );

  // サイドバーは全画面区分で常時表示される。詳細は detail 区分へ一本化したため、
  // どの区分から選んでも選択 + navigate("detail") で全画面詳細(DetailScreen)を開く。
  const handleSidebarSelectTask = useCallback(
    (taskId: string) => {
      setSelectedTaskId(taskId);
      navigate("detail");
    },
    [navigate, setSelectedTaskId],
  );

  // detail（全画面ビュー）からの「← 戻る」/ Esc。board へ戻すと同時に選択を解除し、
  // board をクリーン表示にする。
  const handleBackToBoard = useCallback(() => {
    navigate("board");
    setSelectedTaskId(null);
  }, [navigate, setSelectedTaskId]);

  // HeaderBar 設定トグル。settings 中なら board へ戻す。board / detail からは settings へ。
  // detail から来た場合は選択を解除し、settings → board 復帰後に DetailScreen が
  // 再表示されないようにする（detail と settings は排他）。
  const handleSettingsClick = useCallback(() => {
    if (view === "settings") {
      navigate("board");
      return;
    }
    if (view === "detail") {
      setSelectedTaskId(null);
    }
    navigate("settings");
  }, [view, navigate, setSelectedTaskId]);

  // HeaderBar マイルストーン切替。milestone 中なら board へ戻す。detail から来た場合は
  // 選択を解除する（detail と milestone は排他）。プロジェクト未オープン時は
  // HeaderBar 側でボタン自体を非表示にするため、本ハンドラは loaded 前提で配線する。
  const handleMilestoneClick = useCallback(() => {
    if (view === "milestone") {
      navigate("board");
      return;
    }
    if (view === "detail") {
      setSelectedTaskId(null);
    }
    navigate("milestone");
  }, [view, navigate, setSelectedTaskId]);

  const handleAddTask = useCallback(
    (columnName: string) => {
      setCreateModal({ kind: "normal", status: columnName });
      // board の「+」起点: 戻り先は board。
      setReturnView("board");
      setReturnTaskId(null);
      navigate("create");
    },
    [navigate, setCreateModal, setReturnView, setReturnTaskId],
  );

  const handleCloseCreateModal = useCallback(() => {
    setCreateModal(null);
    // 戻り先（board / 元の detail）を純関数で解決し、resolveCloseTarget の契約どおり
    // selectedTaskId は常に target の値で上書きする。null 戻りのケースでは選択を
    // 確実にクリアし、stale な detail 選択が board に残らないようにする。
    const target = resolveCloseTarget(returnView, returnTaskId);
    setSelectedTaskId(target.selectedTaskId);
    setReturnView("board");
    setReturnTaskId(null);
    navigate(target.view);
  }, [
    returnView,
    returnTaskId,
    navigate,
    setCreateModal,
    setReturnView,
    setReturnTaskId,
    setSelectedTaskId,
  ]);

  const defaultCreateStatus =
    columns.length > 0
      ? columns.reduce((lowest, column) =>
          column.order < lowest.order ? column : lowest,
        ).name
      : null;

  const handleAddSubIssue = useCallback(
    (parentFilePath: string) => {
      // 利用可能なステータスがなければ toast して中断（create へ遷移しない）。
      // これを消すと createModal=null のまま navigate("create") され、
      // create ビューだが TaskCreateScreen も board も描画されず空画面になる。
      if (defaultCreateStatus === null) {
        showToast("利用可能なステータスがありません", "error");
        return;
      }
      setCreateModal({
        kind: "subIssue",
        status: defaultCreateStatus,
        parentPath: parentFilePath,
      });
      // detail サブIssue 起点: 戻り先は元の detail（親タスク）。
      setReturnView("detail");
      setReturnTaskId(selectedTaskId);
      navigate("create");
    },
    [
      defaultCreateStatus,
      selectedTaskId,
      showToast,
      navigate,
      setCreateModal,
      setReturnView,
      setReturnTaskId,
    ],
  );

  const handleCreateTask = useCallback(
    async (values: TaskFormValues): Promise<void> => {
      const result = await submitCreateTask(values);
      if (!result.ok) {
        // 画面を閉じない: TaskCreateScreen は onSubmit reject で開いたままになる
        const message = projectErrorMessage(result.error);
        showErrorUnlessNotified(
          result.error,
          `タスクの作成に失敗しました: ${message}`,
        );
        throw new Error(message);
      }
      const { failedSubIssues } = result.value;
      if (failedSubIssues.length > 0) {
        // 親と成功した子は残す。失敗した子のみ警告（ロールバックしない）。
        showToast(
          `サブIssue ${failedSubIssues.length} 件の作成に失敗しました`,
          "warning",
        );
        return;
      }
      showToast("タスクを作成しました", "success");
    },
    [submitCreateTask, showToast, showErrorUnlessNotified],
  );

  // サブIssue モードのときだけ自動セットされた親 path を取り出す（通常作成 / 閉時は undefined）。
  const subIssueParentPath =
    createModal?.kind === "subIssue" ? createModal.parentPath : undefined;
  // サブIssue モード中は親候補を 1 件に絞り、ユーザに「親が自動セットされた」ことを示す。
  // tasks から親が消えると filter 結果が [] になり、ParentTaskSelect の filePath fallback が起動する。
  const parentCandidates = useMemo(() => {
    if (subIssueParentPath === undefined) {
      return tasks;
    }
    return tasks.filter((t) => t.filePath === subIssueParentPath);
  }, [tasks, subIssueParentPath]);
  const parentReadOnly = subIssueParentPath !== undefined;

  /**
   * state.kind に応じて main 領域を描画する。
   *
   * @returns Loading / EmptyState / Board のいずれか
   */
  const renderMain = (): React.ReactNode => {
    if (state.kind === "loading") {
      return (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted">読み込み中…</p>
        </div>
      );
    }
    if (state.kind !== "loaded") {
      return <EmptyState type="no-project" onOpenProject={openProject} />;
    }
    // tasks 0 件でも Board は描画する (column UI / +追加 ボタンを残すため、
    // board-view spec に従う)。空プロジェクト時のガイダンスは Board 上に
    // 重ねて表示する。
    return (
      <div className="relative flex flex-1 overflow-hidden">
        <BoardWorkspace
          // settings 表示中は BoardWorkspace が unmount されるため、settings→board 遷移で
          // 必ず remount される。これにより useTaskFilter の useState 初期 seed が遷移ごとに
          // 1 回適用される（key の追加はかえって seed→クリア→再 remount で seed 消失を招く
          // ので付けない）。
          columns={columns}
          tasks={tasks}
          tasksByNormalizedPath={tasksByNormalizedPath}
          doneColumn={doneColumn}
          milestonesByName={milestonesResource.byName}
          milestones={milestonesResource.milestones}
          onAddTask={handleAddTask}
          onAddColumn={handleAddColumn}
          onRenameColumn={handleRenameColumn}
          onDeleteColumn={handleDeleteColumn}
          onTaskClick={handleTaskClick}
          onTaskDrop={handleTaskDrop}
          onColumnReorder={handleColumnReorder}
          initialLabelFilter={pendingLabelFilter}
          onLabelFilterApplied={handleLabelFilterApplied}
        />
        {tasks.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-12 flex justify-center">
            <p className="rounded bg-surface/90 px-4 py-2 text-sm text-muted shadow">
              タスクがありません。「+追加」ボタンまたはmdファイルを作成してタスクを追加してください
            </p>
          </div>
        )}
      </div>
    );
  };

  // 作成ビューは独自の全画面 chrome（topbar/subbar/footer）を持つ standalone レイアウトのため、
  // 共通の HeaderBar / AppSidebar を外して viewport 全体に描画する。
  // ToastContainer / LiveRegion は全ビュー共通の縦断 UI かつ Provider key remount で
  // 巻き込まれないよう AppShell 側に hoist 済（in-flight announcement / toast の保全のため）。
  const isCreateView = view === "create" && createModal !== null;

  if (isCreateView && createModal !== null) {
    return (
      <TaskCreateScreen
        columns={columns}
        projectPath={loadedPath ?? undefined}
        projectName={projectName}
        watchedFileCount={tasks.length}
        initialStatus={createModal.status}
        parentCandidates={parentCandidates}
        existingTasks={tasks}
        initialParent={subIssueParentPath}
        parentReadOnly={parentReadOnly}
        onSubmit={handleCreateTask}
        onClose={handleCloseCreateModal}
      />
    );
  }
  return (
    <>
      <HeaderBar
        view={view}
        onSettingsClick={handleSettingsClick}
        onMilestoneClick={
          state.kind === "loaded" ? handleMilestoneClick : undefined
        }
        onOpenClick={handleOpenClick}
      />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar
          projectName={projectName}
          currentPath={displayedPath ?? undefined}
          recentProjects={recentProjects}
          tasks={tasks}
          selectedTaskId={selectedTaskId}
          onOpenProject={handleOpenClick}
          onOpenProjectPath={handleOpenProjectPath}
          onSelectTask={handleSidebarSelectTask}
        />
        <main className="flex flex-1 overflow-hidden">
          {view === "settings" && (
            <SettingsScreen
              labels={settingsLabelsResource}
              milestones={settingsMilestonesResource}
              milestoneMutations={milestoneMutations}
              onLabelUsageClick={handleLabelUsageClick}
            />
          )}
          {view === "milestone" && (
            <MilestoneViewScreen
              resource={milestonesResource}
              tasks={tasks}
              doneColumn={doneColumn}
              onCreateMilestone={milestoneMutations.create}
              isCreating={milestoneMutations.isPending}
            />
          )}
          {view === "detail" && selectedTask && (
            <DetailScreen
              task={selectedTask}
              columns={columns}
              allTasks={tasks}
              tasksByNormalizedPath={tasksByNormalizedPath}
              doneColumn={doneColumn}
              // 作成は全画面 create ビューへ分離され detail と共存しないため、
              // detail に重なる上位モーダルは存在しない（旧 createModal 派生を廃止）。
              // createModal が stale でも detail の Esc 戻るが抑止されない。
              isUpperModalOpen={false}
              onBack={handleBackToBoard}
              onTaskUpdate={handleTaskUpdate}
              onDelete={handleTaskDelete}
              onAddSubIssue={handleAddSubIssue}
              onSelectTask={handleSelectTask}
              onAddLink={handleAddLink}
              onRemoveLink={handleRemoveLink}
            />
          )}
          {view !== "settings" &&
            view !== "detail" &&
            view !== "milestone" &&
            view !== "create" &&
            renderMain()}
        </main>
      </div>
    </>
  );
};

/**
 * App 本体（旧 App の処理一式）。state / 非 navigate ハンドラ / 派生値の取得を
 * ここに集約し、`<AppViewProvider key={loadedPath ?? "idle"}>` で
 * {@link AppShellBody} を包む。AppShell は Provider key remount に巻き込まれないため、
 * view 以外の state（selectedTaskId / pendingDeleteTask / createModal 等）は
 * project 切替を跨いでも自前の render-phase reset で必要に応じてリセットされる。
 *
 * @returns アプリケーションのルートレイアウト要素
 */
const AppShell = () => {
  const toasts = useToasts();
  const { showToast } = toasts;
  const recentProjects = useRecentProjects();
  const { add: addRecentProject } = recentProjects;

  // project の load 成功イベントで実行する副作用。useProject の onLoaded callback に
  // 注入することで、effect + ref による「発火済み管理」を排し、load 完了という
  // 1 回のイベントで「最近一覧記録」と「警告トースト発火」をまとめて実行する。
  // close → reopen / 別 project 切替のたびに改めて 1 回ずつ呼ばれる。
  const handleProjectLoaded = useCallback(
    ({ path, data }: ProjectLoadedEvent): void => {
      // 最近開いた一覧へ記録する（サイドバーからの再オープン用）。
      addRecentProject(path);
      // リンク切れ / パースエラーは判定ドメイン・文言が別なので個別に集計して通知する。
      const brokenLinkCount = countTasksWithBrokenLink(
        data.tasks,
        buildTasksByNormalizedPath(data.tasks),
      );
      if (brokenLinkCount >= 1) {
        showToast(`リンク切れが ${brokenLinkCount} 件あります`, "warning");
      }
      const parseErrorCount = countTasksWithParseError(data.tasks);
      if (parseErrorCount >= 1) {
        showToast(`パースエラーが ${parseErrorCount} 件あります`, "warning");
      }
    },
    [addRecentProject, showToast],
  );

  const project = useProject({
    onError: (err) => {
      // invokeWrapped が既に通知済み（allowlist 由来 tauri）なら二重通知を避ける。
      // allowlist 外 tauri（open_project / get_columns refresh / update_card_order 同一カラム）
      // と非 tauri（invalid-state / validation）は invokeWrapped が出さないのでここで通知する。
      if (wasNotifiedByInvokeWrapped(err)) {
        return;
      }
      showToast(projectErrorMessage(err), "error");
    },
    onLoaded: handleProjectLoaded,
  });
  const {
    state,
    createTask,
    updateTask,
    deleteTask,
    updateColumns,
    moveTask,
    reorderColumns,
    addLink,
    removeLink,
  } = project;
  const { submit: submitCreateTask } = useTaskCreate({ createTask });

  // invokeWrapped 層の失敗トーストを App の showToast へ橋渡しする。
  // React 19 strict-mode の二重マウント / showToast 再生成に追従するため依存配列に
  // showToast を入れ、register が返す cleanup で必ず解除する。cleanup は「自分が登録した
  // sink のときだけ」解除するため、再マウント順序の入れ替わりで新しい sink を誤って消さない。
  useEffect(() => registerToastSink(showToast), [showToast]);

  // 書き込み失敗の error トーストを出す共通ガード。allowlist 由来失敗は invokeWrapped が
  // 既に通知済みのため抑止し、allowlist 外 tauri / 非 tauri 失敗だけ App 側で出す
  // （サイレント化防止）。成功トースト・partial-move 専用文・announce・throw は各ハンドラ側に残す。
  const showErrorUnlessNotified = useCallback(
    (error: ProjectError, message: string): void => {
      if (!wasNotifiedByInvokeWrapped(error)) {
        showToast(message, "error");
      }
    },
    [showToast],
  );

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  // 削除楽観 dispatch 中に tasks から消えた target を一時保持する snapshot。
  // 存在する間は selectedTask 計算の fallback として参照され、DetailScreen が
  // pending 中も描画継続できる。rollback で tasks に戻れば自然と fallback は不要になる。
  const [pendingDeleteTask, setPendingDeleteTask] = useState<Task | null>(null);
  // 作成画面（全画面 create）の開閉と親コンテキストを 1 つの判別可能 union で表す。
  // 旧来は status / parent / subIssueParentPath の 3 つの useState を毎回セットで遷移させて
  // いたが、1 つでも更新を漏らすと「親だけ残った作成画面」等の曖昧状態が成立しうるため、
  // 不正な組み合わせを表現不能にするよう単一 state へ統合している（詳細は CreateModalState）。
  const [createModal, setCreateModal] = useState<CreateModalState>(null);
  // create（全画面作成画面）を閉じたときの戻り先。create 起動時に直前の view と
  // 選択タスクを退避し、キャンセル/成功後に元の画面（board / 元の detail）へ戻す。
  const [returnView, setReturnView] = useState<AppView>("board");
  const [returnTaskId, setReturnTaskId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<LiveAnnouncement | null>(
    null,
  );
  const announceCounterRef = useRef(0);
  const announce = useCallback((text: string) => {
    announceCounterRef.current += 1;
    setAnnouncement({ id: announceCounterRef.current, text });
  }, []);

  // プロジェクト切替時に UI 状態（選択中タスク・作成モーダル）をリセットする。
  // loaded 状態の path が「実際に別 path に変わった」ときだけ trigger する。
  // 中間状態 (loading / error / idle) は無視する。
  //
  // task ID が file path ベースで project 間で衝突しうるため、useEffect では
  // 最初の render が stale UI state で新プロジェクトのデータを参照する race が
  // 発生する。React 公式の "Adjusting state when a prop changes" パターン
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // に従い、render-phase で同期的に reset する。AppShell は Provider remount に
  // 巻き込まれないため、本ブロックは project 切替の都度確実に走る。view の
  // リセットは <AppViewProvider key={loadedPath}> の remount が担当するため
  // navigate を呼ぶ必要はない。
  const loadedPath = state.kind === "loaded" ? state.path : null;
  const [prevLoadedPath, setPrevLoadedPath] = useState<string | null>(null);
  if (loadedPath !== null && loadedPath !== prevLoadedPath) {
    // project が切り替わった: 旧 project の UI state を一括 reset する。
    // 削除 pending 中の snapshot を残すと、新 project の DetailScreen に
    // 旧 project の task が fallback として表示されてしまう。
    setPrevLoadedPath(loadedPath);
    setSelectedTaskId(null);
    setCreateModal(null);
    setReturnView("board");
    setReturnTaskId(null);
    setPendingDeleteTask(null);
  } else if (state.kind !== "loaded") {
    // loaded から非 loaded (loading / error / idle) に抜けた: project を
    // 閉じた / 再 open 中 / 失敗状態。pending 中の snapshot と create modal は
    // それぞれ独立に保持されうるため、両方を同 render pass で reset する。
    if (pendingDeleteTask !== null) {
      setPendingDeleteTask(null);
    }
    if (createModal !== null) {
      setCreateModal(null);
      setReturnView("board");
      setReturnTaskId(null);
    }
  }

  const tasks = tasksOf(state);
  const columns = columnsOf(state);
  const doneColumn = doneColumnOf(state);
  const tasksByNormalizedPath = useMemo(
    () => buildTasksByNormalizedPath(tasks),
    [tasks],
  );
  // ボード / マイルストーンビューへ配るマイルストーンリソース（唯一の取得点）。
  // loaded path を projectKey にすることで、プロジェクト切替時に再取得され、
  // 未オープン時は idle（空）になる。
  const milestonesResource = useMilestones(loadedPath ?? undefined);
  // マイルストーン CRUD ハンドルを App で 1 インスタンスだけ生成し、
  // SettingsScreen → MilestoneSettingsTab / MilestoneViewScreen → MilestoneCreateModal
  // の 3 画面で同一インスタンスを共有する。フック内部の in-flight ガード（inFlightRef）
  // を画面間で共有することで、片方の mutation 実行中に画面遷移して別画面から送信しても
  // 同じガードで短絡され、並行書き込みが直列化される。
  const milestoneMutations = useMilestoneMutations(milestonesResource.reload);
  // 設定画面の使用数はバックエンドのスナップショット（resource.usageCounts）だと
  // タスク変更後に stale になり、削除確認が「未使用」と誤判定しうる。live な tasks から
  // 毎回算出した usageCounts で上書きして渡し、常に現在の参照状況を反映させる。
  const settingsMilestonesResource = useMemo(
    () => ({
      ...milestonesResource,
      usageCounts: Milestone.usageCounts(tasks),
    }),
    [milestonesResource, tasks],
  );
  // ラベルリソース（settings 向けの唯一の取得点）。TaskForm は別途 useLabelList を使う。
  const labelsResource = useLabels(loadedPath ?? undefined);
  // settings の使用数は milestone と対称に live な tasks から算出した値で上書きする。
  // ただし「プロジェクトが loaded」のときだけ。未ロードの間は BE 由来の usageCounts を
  // 維持し、ロード前の瞬間に「0 件 / 未使用」と誤表示しないようにする（loaded で 0 件は
  // live の 0 が正解）。
  const isProjectLoaded = state.kind === "loaded";
  const settingsLabelsResource = useMemo(
    () => ({
      ...labelsResource,
      usageCounts: isProjectLoaded
        ? LabelRegistry.labelUsageCounts(tasks)
        : labelsResource.usageCounts,
    }),
    [labelsResource, tasks, isProjectLoaded],
  );
  // settings → board へラベル絞り込みを 1 回だけ持ち込むための pending state。
  // 適用後は BoardWorkspace の onLabelFilterApplied コールバックで null へ戻す。
  const [pendingLabelFilter, setPendingLabelFilter] = useState<string | null>(
    null,
  );
  const handleLabelFilterApplied = useCallback(() => {
    setPendingLabelFilter(null);
  }, []);

  // path 末尾セグメントを project 名として表示する。OS の path separator は
  // / / \ どちらにも対応する (Windows / POSIX 双方)。
  const displayedPath = state.kind === "loaded" ? state.path : null;
  const projectName =
    displayedPath !== null ? basenameOf(displayedPath) : undefined;

  const handleSelectTask = useCallback(
    (taskId: string) => {
      const outcome = selectTaskOutcome(tasks, taskId);
      if (outcome === null) {
        return;
      }
      setSelectedTaskId(outcome.selectedTaskId);
      announce(outcome.announceText);
    },
    [tasks, announce],
  );

  const handleTaskUpdate = useCallback(
    async (id: string, updates: Partial<Omit<Task, "id">>) => {
      const filePath = tasks.find((t) => t.id === id)?.filePath;
      if (filePath === undefined) {
        return;
      }
      // filePath は lookup key なので spread 順序を後置にして上書き防止
      const result = await updateTask({ ...updates, filePath });
      if (!result.ok) {
        showErrorUnlessNotified(
          result.error,
          `タスクの更新に失敗しました: ${projectErrorMessage(result.error)}`,
        );
        return;
      }
      showToast("タスクを更新しました", "success");
    },
    [tasks, updateTask, showToast, showErrorUnlessNotified],
  );

  const handleAddColumn = useCallback(
    async (columnName: string): Promise<void> => {
      // 呼び出し時点の best-effort 検証（即座の UX フィードバック）
      if (columns.some((c) => c.name === columnName)) {
        showToast("同じ名前のカラムが既に存在します", "error");
        return;
      }
      const result = await updateColumns((current) => {
        // queue 実行時の最新 state で再検証（先行する add で重複していたら silent skip）
        if (current.columns.some((c) => c.name === columnName)) {
          return null;
        }
        const maxOrder = current.columns.reduce(
          (acc, c) => (c.order > acc ? c.order : acc),
          -1,
        );
        return {
          columns: [
            ...current.columns,
            { name: columnName, order: maxOrder + 1 },
          ],
        };
      });
      if (!result.ok) {
        const message = projectErrorMessage(result.error);
        showErrorUnlessNotified(
          result.error,
          `カラムの追加に失敗しました: ${message}`,
        );
        // AddColumnButton が editor を維持できるよう reject し直す
        throw new Error(message);
      }
      if (!result.value.applied) {
        // queue 内 silent skip (先行 add で同名カラムが追加済等)
        // AddColumnButton が editor を維持してユーザに retry させる
        const message =
          "カラムの追加が適用されませんでした (他の操作と競合した可能性)";
        showToast(message, "error");
        throw new Error(message);
      }
      showToast("カラムを追加しました", "success");
    },
    [columns, updateColumns, showToast, showErrorUnlessNotified],
  );

  const handleRenameColumn = useCallback(
    async (oldName: string, newName: string): Promise<void> => {
      if (!columns.some((c) => c.name === oldName)) {
        return;
      }
      if (columns.some((c) => c.name === newName)) {
        showToast("同じ名前のカラムが既に存在します", "error");
        return;
      }
      const result = await updateColumns((current) => {
        if (!current.columns.some((c) => c.name === oldName)) {
          return null;
        }
        if (current.columns.some((c) => c.name === newName)) {
          return null;
        }
        // doneColumn が rename 対象なら新名に更新する。
        // 該当しない場合は undefined のままで BE/reducer 側が既存値を保持する。
        const doneColumn = current.doneColumn === oldName ? newName : undefined;
        return {
          columns: current.columns.map((c) =>
            c.name === oldName ? { ...c, name: newName } : c,
          ),
          renames: [{ from: oldName, to: newName }],
          doneColumn,
        };
      });
      if (!result.ok) {
        const message = projectErrorMessage(result.error);
        showErrorUnlessNotified(
          result.error,
          `カラム名の変更に失敗しました: ${message}`,
        );
        // ColumnHeader が edit mode を維持できるよう reject し直す
        throw new Error(message);
      }
      if (!result.value.applied) {
        // queue 内 silent skip (rename 対象が消えた / 重複が発生した等)
        // ColumnHeader が edit mode を維持してユーザに retry させる
        const message =
          "カラム名の変更が適用されませんでした (他の操作と競合した可能性)";
        showToast(message, "error");
        throw new Error(message);
      }
      showToast("カラム名を変更しました", "success");
    },
    [columns, updateColumns, showToast, showErrorUnlessNotified],
  );

  const handleDeleteColumn = useCallback(
    async (
      columnName: string,
      destColumn: string | undefined,
    ): Promise<void> => {
      if (!columns.some((c) => c.name === columnName)) {
        return;
      }
      if (columns.length <= 1) {
        showToast("最後のカラムは削除できません", "error");
        return;
      }
      if (destColumn !== undefined) {
        if (
          destColumn === columnName ||
          !columns.some((c) => c.name === destColumn)
        ) {
          showToast("移動先カラムが不正です", "error");
          return;
        }
      } else if (tasks.some((t) => t.status === columnName)) {
        showToast("タスクが残っているため移動先カラムが必要です", "error");
        return;
      }
      const result = await updateColumns((current) => {
        if (!current.columns.some((c) => c.name === columnName)) {
          return null;
        }
        if (current.columns.length <= 1) {
          return null;
        }
        if (
          destColumn !== undefined &&
          !current.columns.some((c) => c.name === destColumn)
        ) {
          return null;
        }
        // command queue 実行までに先行 task command で対象カラムへタスクが
        // 追加される可能性がある。destColumn 未指定で残タスクがあれば silent skip
        // （呼び出し時点では 0 件だが、queue 実行時に 1 件以上へ増えていたケース）。
        if (
          destColumn === undefined &&
          current.tasks.some((t) => t.status === columnName)
        ) {
          return null;
        }
        // doneColumn が削除対象の場合、destColumn (タスク移動先) を新 doneColumn に
        // する。タスク 0 件削除 + destColumn 未指定の場合は残カラムの max-order を採用
        // (FE 全体で missing doneColumn を max-order column と扱う規約に整合させる)。
        const remainingColumns = current.columns.filter(
          (c) => c.name !== columnName,
        );
        const maxOrderColumn = remainingColumns.reduce<Column | undefined>(
          (acc, c) => (acc === undefined || c.order > acc.order ? c : acc),
          undefined,
        );
        let doneColumn: string | undefined;
        if (current.doneColumn === columnName) {
          doneColumn = destColumn ?? maxOrderColumn?.name;
        }
        return {
          columns: remainingColumns,
          renames:
            destColumn !== undefined
              ? [{ from: columnName, to: destColumn }]
              : undefined,
          doneColumn,
        };
      });
      if (!result.ok) {
        const message = projectErrorMessage(result.error);
        showErrorUnlessNotified(
          result.error,
          `カラムの削除に失敗しました: ${message}`,
        );
        // Column の ConfirmDialog が維持できるよう reject し直す
        throw new Error(message);
      }
      if (!result.value.applied) {
        // queue 内 silent skip (削除対象が消えた / タスク追加で destColumn 必要等)
        // ConfirmDialog を維持してユーザに retry させる
        const message =
          "カラムの削除が適用されませんでした (他の操作と競合した可能性)";
        showToast(message, "error");
        throw new Error(message);
      }
      showToast("カラムを削除しました", "success");
    },
    [columns, tasks, updateColumns, showToast, showErrorUnlessNotified],
  );

  const handleTaskDrop = useCallback(
    async (params: MoveTaskParams): Promise<void> => {
      const targetTitle =
        tasks.find((t) => t.filePath === params.taskFilePath)?.title ??
        params.taskFilePath;
      /**
       * カラム間 status 変更の楽観 dispatch 直後に呼ばれる callback。
       * 同一カラム並び替え（fromColumn === toColumn）では LiveRegion を更新しない。
       *
       * @param event optimistic 通知 payload
       */
      const onOptimisticApplied = (event: {
        fromColumn: string;
        toColumn: string;
      }): void => {
        if (event.fromColumn !== event.toColumn) {
          announce(`「${targetTitle}」を「${event.toColumn}」に移動しました`);
        }
      };
      /**
       * カラム間 updateTask 失敗時の rollback 完了直後に呼ばれる callback。
       * LiveRegion に「取り消しました」を流す。
       */
      const onRollback = (): void => {
        announce(`「${targetTitle}」の移動を取り消しました`);
      };
      const result = await moveTask(params, {
        onOptimisticApplied,
        onRollback,
      });
      if (!result.ok) {
        if (result.error.kind === "partial-move") {
          showToast(result.error.message, "error");
          return;
        }
        // cross-column の update_task 失敗（allowlist 由来）は invokeWrapped が通知済み → 抑止。
        // 同一カラム並び替えの update_card_order 失敗（allowlist 外 tauri）はサイレント化を
        // 避けるため従来どおり generic を出す。
        showErrorUnlessNotified(
          result.error,
          `タスクの移動に失敗しました: ${projectErrorMessage(result.error)}`,
        );
      }
    },
    [tasks, moveTask, announce, showToast, showErrorUnlessNotified],
  );

  const handleColumnReorder = useCallback(
    async (params: {
      fromColumnName: string;
      toColumnName: string;
    }): Promise<void> => {
      /**
       * 楽観 dispatch 直後に呼ばれる callback。LiveRegion で「N 番目に移動しました」をアナウンスする。
       *
       * @param event optimistic 通知 payload
       */
      const onOptimisticApplied = (event: ReorderColumnsEvent): void => {
        announce(
          `「${event.columnName}」を ${event.toIndex + 1} 番目に移動しました`,
        );
      };
      /**
       * rollback 完了直後に呼ばれる callback。LiveRegion に取り消しをアナウンスする。
       *
       * @param event rollback 通知 payload
       */
      const onRollback = (event: ReorderColumnsEvent): void => {
        announce(`「${event.columnName}」の移動を取り消しました`);
      };
      const result = await reorderColumns(
        params.fromColumnName,
        params.toColumnName,
        { onOptimisticApplied, onRollback },
      );
      if (result.ok) {
        return;
      }
      // project switch (invalid-state + PROJECT_SWITCHED_MESSAGE) は reducer が
      // 既に新 project に切替済みで、楽観 dispatch / rollback も走らないため
      // toast を出さない（無関係なエラー通知になる）。
      if (
        result.error.kind === "invalid-state" &&
        result.error.message === PROJECT_SWITCHED_MESSAGE
      ) {
        return;
      }
      // update_columns 失敗（reorderColumnsAction は updateColumns 経由）は invokeWrapped が
      // 通知済み → 抑止。invalid-state 等の非 tauri はサイレント化を避けるため残す。
      showErrorUnlessNotified(
        result.error,
        `カラムの並び替えに失敗しました: ${projectErrorMessage(result.error)}`,
      );
    },
    [reorderColumns, announce, showErrorUnlessNotified],
  );

  const handleAddLink = useCallback(
    async (sourceFilePath: string, targetFilePath: string) => {
      const source = tasks.find((t) => t.filePath === sourceFilePath);
      const target = tasks.find((t) => t.filePath === targetFilePath);
      const sourceTitle = source?.title || sourceFilePath;
      const targetTitle = target?.title || targetFilePath;

      const result = await addLink({
        filePath: sourceFilePath,
        targetFilePath,
      });

      if (!result.ok) {
        // project switch 由来の invalid-state は新 project に対する無関係な通知
        // になるため toast / announce を出さない（move/delete と同方針）。
        if (
          result.error.kind === "invalid-state" &&
          result.error.message === PROJECT_SWITCHED_MESSAGE
        ) {
          return result;
        }
        const message = projectErrorMessage(result.error);
        // add_link 失敗は invokeWrapped が通知済み → 抑止。非 tauri は残す。
        // announce（取消）は通知有無に関わらず常に残す。
        showErrorUnlessNotified(
          result.error,
          `リンクの追加に失敗しました: ${message}`,
        );
        announce(
          `「${sourceTitle}」への「${targetTitle}」のリンク追加を取り消しました`,
        );
        return result;
      }

      announce(`「${sourceTitle}」に「${targetTitle}」をリンクしました`);
      return result;
    },
    [tasks, addLink, announce, showErrorUnlessNotified],
  );

  const handleRemoveLink = useCallback(
    async (sourceFilePath: string, targetFilePath: string) => {
      const source = tasks.find((t) => t.filePath === sourceFilePath);
      const target = tasks.find((t) => t.filePath === targetFilePath);
      const sourceTitle = source?.title || sourceFilePath;
      const targetTitle = target?.title || targetFilePath;

      const result = await removeLink({
        filePath: sourceFilePath,
        targetFilePath,
      });

      if (!result.ok) {
        if (
          result.error.kind === "invalid-state" &&
          result.error.message === PROJECT_SWITCHED_MESSAGE
        ) {
          return result;
        }
        const message = projectErrorMessage(result.error);
        // remove_link 失敗は invokeWrapped が通知済み → 抑止。非 tauri は残す。
        // announce（取消）は通知有無に関わらず常に残す。
        showErrorUnlessNotified(
          result.error,
          `リンクの削除に失敗しました: ${message}`,
        );
        announce(
          `「${sourceTitle}」から「${targetTitle}」へのリンク削除を取り消しました`,
        );
        return result;
      }

      announce(
        `「${sourceTitle}」から「${targetTitle}」へのリンクを削除しました`,
      );
      return result;
    },
    [tasks, removeLink, announce, showErrorUnlessNotified],
  );

  const handleTaskDelete = useCallback(
    async (id: string, orphanStrategy?: OrphanStrategy): Promise<void> => {
      const target = tasks.find((t) => t.id === id);
      if (target === undefined) {
        return;
      }
      const { filePath, title } = target;
      // 楽観 dispatch で tasks から target が消える前に snapshot を保持する。
      // pendingDeleteTask が存在する限り DetailScreen は描画を継続できる。
      setPendingDeleteTask(target);

      const result = await deleteTask({ filePath, orphanStrategy });

      if (!result.ok) {
        // rollback で tasks に target が戻るので snapshot は不要になる。
        setPendingDeleteTask(null);

        // project switch 由来の invalid-state は新 project に対する無関係な通知に
        // なるため toast / announce を出さない (reorderColumns と同方針)。
        // ただし useDeleteFlow は onDelete の resolve を success とみなすので、
        // 原因を残した Error を throw して deleting → error 遷移を成立させる
        // (UI には出ないが、useDeleteFlow.state.reason / ログ追跡で原因を保持する)。
        // queue 直列化により通常はこの経路に乗らない防御的フォールバック。
        if (
          result.error.kind === "invalid-state" &&
          result.error.message === PROJECT_SWITCHED_MESSAGE
        ) {
          throw new Error(PROJECT_SWITCHED_MESSAGE);
        }

        const message = projectErrorMessage(result.error);
        // delete_task 失敗は invokeWrapped が通知済み → 抑止。非 tauri は残す。
        // announce（取消）と throw は通知有無に関わらず常に残す。
        showErrorUnlessNotified(
          result.error,
          `タスクの削除に失敗しました: ${message}`,
        );
        announce(`「${title}」の削除を取り消しました`);
        throw new Error(message);
      }

      setSelectedTaskId(null);
      setPendingDeleteTask(null);
      showToast("タスクを削除しました", "success");
      announce(`「${title}」を削除しました`);
    },
    [tasks, deleteTask, showToast, announce, showErrorUnlessNotified],
  );

  // ToastContainer / LiveRegion は AppViewProvider の外に置く。Provider が
  // <AppViewProvider key={loadedPath ?? "idle"}> で project 切替時に remount される際、
  // 配下の DOM もまとめて remount されるため、in-flight な toast / aria-live announcement
  // を巻き込まずに保つにはこのレイヤで描画する必要がある。useToasts / announcement state は
  // AppShell が所有しているので、Provider の外から参照しても整合は崩れない。
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <AppViewProvider key={loadedPath ?? "idle"}>
        <AppShellBody
          showToast={toasts.showToast}
          recentProjects={recentProjects}
          project={project}
          submitCreateTask={submitCreateTask}
          loadedPath={loadedPath}
          tasks={tasks}
          columns={columns}
          doneColumn={doneColumn}
          tasksByNormalizedPath={tasksByNormalizedPath}
          projectName={projectName}
          displayedPath={displayedPath}
          milestonesResource={milestonesResource}
          settingsMilestonesResource={settingsMilestonesResource}
          milestoneMutations={milestoneMutations}
          settingsLabelsResource={settingsLabelsResource}
          selectedTaskId={selectedTaskId}
          setSelectedTaskId={setSelectedTaskId}
          pendingDeleteTask={pendingDeleteTask}
          createModal={createModal}
          setCreateModal={setCreateModal}
          returnView={returnView}
          setReturnView={setReturnView}
          returnTaskId={returnTaskId}
          setReturnTaskId={setReturnTaskId}
          pendingLabelFilter={pendingLabelFilter}
          setPendingLabelFilter={setPendingLabelFilter}
          showErrorUnlessNotified={showErrorUnlessNotified}
          handleTaskUpdate={handleTaskUpdate}
          handleAddColumn={handleAddColumn}
          handleRenameColumn={handleRenameColumn}
          handleDeleteColumn={handleDeleteColumn}
          handleTaskDrop={handleTaskDrop}
          handleColumnReorder={handleColumnReorder}
          handleAddLink={handleAddLink}
          handleRemoveLink={handleRemoveLink}
          handleTaskDelete={handleTaskDelete}
          handleSelectTask={handleSelectTask}
          handleLabelFilterApplied={handleLabelFilterApplied}
        />
      </AppViewProvider>
      <ToastContainer toasts={toasts.toasts} onDismiss={toasts.dismissToast} />
      <LiveRegion announcement={announcement} />
    </div>
  );
};

/**
 * アプリケーションのルートコンポーネント。配線のみを担当し、
 * 実体は private な {@link AppShell} に委譲する。
 * @returns ルート要素
 */
export const App = () => {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
};
