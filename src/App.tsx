import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type LiveAnnouncement, LiveRegion } from "@/components/LiveRegion";
import { buildTasksByNormalizedPath } from "@/domains/broken-link";
import { LabelRegistry } from "@/domains/label-registry";
import { Milestone } from "@/domains/milestone";
import { Task } from "@/domains/task";
import { selectTaskOutcome } from "@/domains/task-selection";
import { useLabels } from "@/hooks/useLabels";
import { useMilestones } from "@/hooks/useMilestones";
import type { OrphanStrategy } from "@/lib/tauri";
import {
  type AppView,
  AppViewProvider,
  useAppView,
} from "@/providers/AppViewProvider";
import { resolveCloseTarget } from "@/providers/AppViewProvider/resolveCloseTarget";
import { ProjectNotificationsProvider } from "@/providers/ProjectNotificationsProvider";
import {
  type MoveTaskParams,
  PROJECT_SWITCHED_MESSAGE,
  type ProjectError,
  ProjectProvider,
  type ProjectState,
  projectErrorMessage,
  type ReorderColumnsEvent,
  useProjectColumnActions,
  useProjectSessionActions,
  useProjectState,
  useProjectTaskActions,
  wasNotifiedByInvokeWrapped,
} from "@/providers/ProjectProvider";
import {
  RecentProjectsProvider,
  useRecentProjects,
} from "@/providers/RecentProjectsProvider";
import { ToastProvider, useToastDispatch } from "@/providers/ToastProvider";
import { basenameOf } from "@/utils/path";
import { BoardWorkspace, EmptyState, HeaderBar } from "./features/board";
import { DetailScreen } from "./features/detail";
import { MilestoneViewScreen } from "./features/milestoneView";
import { SettingsScreen, useMilestoneMutations } from "./features/settings";
import { AppSidebar, ThemeProvider } from "./features/shell";
import {
  TaskCreateScreen,
  type TaskFormValues,
  useTaskCreate,
} from "./features/task-form";
import type { Column } from "./types/column";

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
 * App 本体。`<AppViewProvider>` の配下に位置するため `useAppView()` を直接呼べる。
 * state / hook / handler / JSX を 1 コンポーネントに集約する。
 *
 * @returns アプリケーションのレイアウト要素
 */
const AppShell = () => {
  const { view, navigate } = useAppView();
  // 配下サブツリーが toasts 配列の差し替えで再 render されないよう dispatch 専用フックを使う。
  const { showToast } = useToastDispatch();
  // sidebar 表示用の最近一覧。add と通知副作用は ProjectNotificationsProvider が担う。
  const { projects: recentProjects } = useRecentProjects();

  const { state } = useProjectState();
  const { openProject, openProjectByPath } = useProjectSessionActions();
  const { createTask, updateTask, deleteTask, moveTask, addLink, removeLink } =
    useProjectTaskActions();
  const { updateColumns, reorderColumns } = useProjectColumnActions();
  const { submit: submitCreateTask } = useTaskCreate({ createTask });

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
  // に従い、render-phase で同期的に reset する。
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
  const handleLabelUsageClick = useCallback(
    (name: string) => {
      setPendingLabelFilter(name);
      navigate("board");
    },
    [navigate],
  );
  const handleLabelFilterApplied = useCallback(() => {
    setPendingLabelFilter(null);
  }, []);

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
  // path 末尾セグメントを project 名として表示する。OS の path separator は
  // / / \ どちらにも対応する (Windows / POSIX 双方)。
  const displayedPath = state.kind === "loaded" ? state.path : null;
  const projectName =
    displayedPath !== null ? basenameOf(displayedPath) : undefined;
  const selectedTask = resolveSelectedTask(
    selectedTaskId,
    tasks,
    pendingDeleteTask,
  );

  // detail（全画面ビュー）表示中に選択タスクが消失したら board へ戻す保険。
  // 削除確定後・外部更新・project 切替で selectedTaskId が null になったとき等を拾う。
  // 同一 ID 再出現時の DetailScreen 意図せぬ復活を防ぐため selectedTaskId も同時にクリア。
  useEffect(() => {
    if (view === "detail" && selectedTask === null) {
      navigate("board");
      if (selectedTaskId !== null) {
        setSelectedTaskId(null);
      }
    }
  }, [view, selectedTask, selectedTaskId, navigate]);

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

  // カードクリックは選択 + detail（全画面2ペイン）への即遷移を併発する。
  // board 上にスライドパネルを重ねる挙動は廃止し、詳細は detail 区分へ一本化する。
  const handleTaskClick = useCallback(
    (taskId: string) => {
      setSelectedTaskId(taskId);
      navigate("detail");
    },
    [navigate],
  );

  // サイドバーは全画面区分で常時表示される。詳細は detail 区分へ一本化したため、
  // どの区分から選んでも選択 + navigate("detail") で全画面詳細(DetailScreen)を開く。
  const handleSidebarSelectTask = useCallback(
    (taskId: string) => {
      setSelectedTaskId(taskId);
      navigate("detail");
    },
    [navigate],
  );

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

  // detail（全画面ビュー）からの「← 戻る」/ Esc。board へ戻すと同時に選択を解除し、
  // board をクリーン表示にする。
  const handleBackToBoard = useCallback(() => {
    navigate("board");
    setSelectedTaskId(null);
  }, [navigate]);

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
  }, [view, navigate]);

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
  }, [view, navigate]);

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

  const handleAddTask = useCallback(
    (columnName: string) => {
      setCreateModal({ kind: "normal", status: columnName });
      // board の「+」起点: 戻り先は board。
      setReturnView("board");
      setReturnTaskId(null);
      navigate("create");
    },
    [navigate],
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
  }, [returnView, returnTaskId, navigate]);

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
    [defaultCreateStatus, selectedTaskId, showToast, navigate],
  );

  // Result をそのまま透過する薄い callback。toast 発火は TaskCreateScreen 内部で行う
  // （成功/部分失敗/エラー時の toast は self-contained）。
  const handleCreateTask = useCallback(
    (values: TaskFormValues) => submitCreateTask(values),
    [submitCreateTask],
  );

  const handleTaskDrop = useCallback(
    async (params: MoveTaskParams): Promise<void> => {
      const targetTask = tasks.find((t) => t.filePath === params.taskFilePath);
      const targetTitle =
        targetTask === undefined
          ? params.taskFilePath
          : Task.displayTitle(targetTask);
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
      const sourceTitle =
        source === undefined ? sourceFilePath : Task.displayTitle(source);
      const targetTitle =
        target === undefined ? targetFilePath : Task.displayTitle(target);

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
      const sourceTitle =
        source === undefined ? sourceFilePath : Task.displayTitle(source);
      const targetTitle =
        target === undefined ? targetFilePath : Task.displayTitle(target);

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
  // LiveRegion は全ビュー共通の縦断 UI のため create でも温存する（ToastContainer は
  // ToastProvider 内蔵となり Provider マウントだけで全 view に描画される）。
  const isCreateView = view === "create" && createModal !== null;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      {isCreateView && createModal !== null ? (
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
      ) : (
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
      )}
      <LiveRegion announcement={announcement} />
    </div>
  );
};

/**
 * アプリケーションのルートコンポーネント。`<AppViewProvider>` を AppShell より外側に
 * 置くことで AppShell から `useAppView()` を直接呼べるようにする。
 *
 * @returns ルート要素
 */
export const App = () => {
  return (
    <ThemeProvider>
      <AppViewProvider>
        <ToastProvider>
          <RecentProjectsProvider>
            <ProjectProvider>
              <ProjectNotificationsProvider>
                <AppShell />
              </ProjectNotificationsProvider>
            </ProjectProvider>
          </RecentProjectsProvider>
        </ToastProvider>
      </AppViewProvider>
    </ThemeProvider>
  );
};
