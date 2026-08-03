import {
  getColumns as getColumnsInvoke,
  openDirectoryDialog,
  openProject as openProjectInvoke,
} from "@/lib/tauri";
import {
  beginOpenRequest,
  enqueueProjectCommand,
  invalidateProject,
  isOpenRequestCurrent,
  isProjectCurrent,
  type ProjectVersion,
} from "../concurrency";
import type { ProjectError } from "../errors";
import type { ProjectData } from "../reducer";
import type { DialogOpening, OpenProjectActionDeps } from "./deps";

type ResolveProjectPathDeps = {
  /** 明示パス。指定時はダイアログを開かずこれを返す。 */
  explicitPath?: string;
  /** ダイアログ二重オープン防止フラグ */
  dialogOpening: DialogOpening;
  /** プロジェクトの有効性バージョン */
  projectVersion: ProjectVersion;
  /** openProjectAction 冒頭で捕捉した open request 世代（bump していない snapshot）。 */
  openRequestSnapshot: number;
  /**
   * 失敗時に呼び出される任意のコールバック。
   * @param error 通知する ProjectError
   */
  onError?: (error: ProjectError) => void;
};

/**
 * 開くプロジェクトのパスを決める。明示パスがあればそれを、なければディレクトリ
 * ダイアログで選んだパスを返す。キャンセル・失敗・無効化時は null。
 * @param deps - パス解決に必要な依存
 * @returns 開くべきパス、開かない場合は null
 */
const resolveProjectPath = async ({
  explicitPath,
  dialogOpening,
  projectVersion,
  openRequestSnapshot,
  onError,
}: ResolveProjectPathDeps): Promise<string | null> => {
  if (explicitPath !== undefined) {
    // ディレクトリダイアログ表示中に最近一覧をクリックした場合の二重 open を防ぐ。
    // explicitPath 分岐は await を挟まず同期実行のため、開始時 snapshot は常に一致する。
    // unmount 後の in-flight 破棄は enqueue 内の世代判定が担う。
    if (dialogOpening.current) {
      return null;
    }
    return explicitPath;
  }

  if (dialogOpening.current) {
    return null;
  }
  dialogOpening.current = true;

  const dialogResult = await openDirectoryDialog();
  dialogOpening.current = false;

  // dialog 表示中に unmount / reset で open request が進んでいたら open-start に進ませない
  // （cleanup の invalidateOpenRequests で snapshot が不一致になる）。
  if (!isOpenRequestCurrent(projectVersion, openRequestSnapshot)) {
    return null;
  }
  if (!dialogResult.ok) {
    onError?.({ kind: "tauri", error: dialogResult.error });
    return null;
  }
  return dialogResult.value;
};

/**
 * project を開き、tasks / columns を一貫した ProjectData として state に反映する。
 * deps.path 指定時はそのパスを、未指定時は directory dialog で選んだパスを開く。
 *
 * @param deps openProject に必要な queue / version / dispatch 依存
 */
export const openProjectAction = async ({
  projectVersion,
  projectCommandQueue,
  dialogOpening,
  path: explicitPath,
  dispatch,
  onError,
  onLoaded,
}: OpenProjectActionDeps): Promise<void> => {
  // 冒頭の openRequest を snapshot する（bump しない）。dialog 解決後にこの世代が
  // 進んでいれば（unmount / reset 由来）open を破棄する。連打ガード / 後勝ちの
  // 世代 bump は path 解決後の beginOpenRequest が担うため位置は変えない。
  const openRequestSnapshot = projectVersion.openRequest;
  // project 世代 current も snapshot する。unmount cleanup / reset は invalidateProject で
  // current を進めるが、concurrent な openProjectByPath 連打は beginOpenRequest（openRequest
  // のみ）で current を進めない。resolve 後に current 一致を確認することで、後勝ちを維持しつつ
  // explicit-path の「resolve 中に world が破棄された」ケースを in-flight 破棄する。
  const projectSnapshot = projectVersion.current;
  const path = await resolveProjectPath({
    explicitPath,
    dialogOpening,
    projectVersion,
    openRequestSnapshot,
    onError,
  });
  if (path === null) {
    return;
  }
  // resolve 中に unmount / reset で project 世代が進んでいたら open-start に進ませない。
  if (!isProjectCurrent(projectVersion, projectSnapshot)) {
    return;
  }

  const openRequest = beginOpenRequest(projectVersion);
  dispatch({ type: "open-start", path });

  await enqueueProjectCommand(projectCommandQueue, async () => {
    if (!isOpenRequestCurrent(projectVersion, openRequest)) {
      return;
    }

    const version = projectVersion.current;

    if (
      !isProjectCurrent(projectVersion, version) ||
      !isOpenRequestCurrent(projectVersion, openRequest)
    ) {
      return;
    }

    const openResult = await openProjectInvoke({ path });
    if (
      !isProjectCurrent(projectVersion, version) ||
      !isOpenRequestCurrent(projectVersion, openRequest)
    ) {
      return;
    }

    if (!openResult.ok) {
      dispatch({ type: "open-fail", path, error: openResult.error });
      onError?.({ kind: "tauri", error: openResult.error });
      return;
    }

    const columnsResult = await getColumnsInvoke();
    if (
      !isProjectCurrent(projectVersion, version) ||
      !isOpenRequestCurrent(projectVersion, openRequest)
    ) {
      return;
    }

    if (!columnsResult.ok) {
      dispatch({ type: "open-fail", path, error: columnsResult.error });
      onError?.({ kind: "tauri", error: columnsResult.error });
      return;
    }

    const data: ProjectData = {
      tasks: openResult.value.tasks,
      columns: columnsResult.value.columns,
      doneColumn: columnsResult.value.doneColumn,
      projections: openResult.value.projections,
      milestoneProjections: openResult.value.milestoneProjections,
      taskTree: openResult.value.taskTree,
      loadWarnings: openResult.value.loadWarnings,
      // この open 固有の識別子。projection 再同期が「open 直後の fresh な payload」と
      // 「open 失敗による旧 project の復元」を区別するために使う（openFail は
      // previousLoaded を同じ path のまま loaded へ戻すため path では区別できない）。
      openRequestId: openRequest,
      // watcher envelope 検証の初期 baseline。tasks と同一トランザクションで
      // 確定した値なので、ここで別途組み立て直してはならない。
      watcherSession: openResult.value.session,
    };
    invalidateProject(projectVersion);
    dispatch({ type: "open-succeed", path, data });
    // load 成功イベントの場所。警告トースト発火 / 最近一覧記録など「開けた帰結」の
    // 副作用を呼び出し側へ 1 回だけ通知する（effect + ref 管理の代替）。
    onLoaded?.({ path, data });
  });
};
