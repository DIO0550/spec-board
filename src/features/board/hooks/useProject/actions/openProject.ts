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
  type ProjectCommandQueue,
  type ProjectVersion,
} from "../concurrency";
import type { ProjectError } from "../errors";
import type { ProjectAction, ProjectData } from "../reducer";

export type DialogOpening = {
  current: boolean;
};

type ResolveProjectPathDeps = {
  /** 明示パス。指定時はダイアログを開かずこれを返す。 */
  explicitPath?: string;
  /** ダイアログ二重オープン防止フラグ */
  dialogOpening: DialogOpening;
  /** プロジェクトの有効性バージョン */
  projectVersion: ProjectVersion;
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
  onError,
}: ResolveProjectPathDeps): Promise<string | null> => {
  if (explicitPath !== undefined) {
    // ダイアログ経由と同様に、解決後のプロジェクト無効化（unmount/deactivate）と
    // 競合した場合は open-start に進ませない。
    if (!projectVersion.active) {
      return null;
    }
    // ディレクトリダイアログ表示中に最近一覧をクリックした場合の二重 open を防ぐ。
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

  if (!projectVersion.active) {
    return null;
  }
  if (!dialogResult.ok) {
    onError?.({ kind: "tauri", error: dialogResult.error });
    return null;
  }
  return dialogResult.value;
};

export type OpenProjectActionDeps = {
  projectVersion: ProjectVersion;
  projectCommandQueue: ProjectCommandQueue;
  dialogOpening: DialogOpening;
  /**
   * 開くプロジェクトのパス。指定時はディレクトリダイアログを開かず直接このパスを開く
   * （最近開いたプロジェクトからの再オープン用）。未指定時はダイアログで選択する。
   */
  path?: string;
  /**
   * reducer に同期的に action を投げる dispatcher。
   * @param action 反映する ProjectAction
   */
  dispatchSync: (action: ProjectAction) => void;
  /**
   * 失敗時に呼び出される任意のコールバック。
   * @param error 通知する ProjectError
   */
  onError?: (error: ProjectError) => void;
  /**
   * load 成功で state を loaded へ遷移させた直後に呼ばれる任意のコールバック。
   * @param event 開いた path と読み込んだ ProjectData
   */
  onLoaded?: (event: { path: string; data: ProjectData }) => void;
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
  dispatchSync,
  onError,
  onLoaded,
}: OpenProjectActionDeps): Promise<void> => {
  const path = await resolveProjectPath({
    explicitPath,
    dialogOpening,
    projectVersion,
    onError,
  });
  if (path === null) {
    return;
  }

  const openRequest = beginOpenRequest(projectVersion);
  dispatchSync({ type: "open-start", path });

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
      dispatchSync({ type: "open-fail", path, error: openResult.error });
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
      dispatchSync({ type: "open-fail", path, error: columnsResult.error });
      onError?.({ kind: "tauri", error: columnsResult.error });
      return;
    }

    const data: ProjectData = {
      tasks: openResult.value.tasks,
      columns: columnsResult.value.columns,
      doneColumn: columnsResult.value.doneColumn,
    };
    invalidateProject(projectVersion);
    dispatchSync({ type: "open-succeed", path, data });
    // load 成功イベントの場所。警告トースト発火 / 最近一覧記録など「開けた帰結」の
    // 副作用を呼び出し側へ 1 回だけ通知する（effect + ref 管理の代替）。
    onLoaded?.({ path, data });
  });
};
