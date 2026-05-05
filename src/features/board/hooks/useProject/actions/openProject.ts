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

export type OpenProjectActionDeps = {
  projectVersion: ProjectVersion;
  projectCommandQueue: ProjectCommandQueue;
  dialogOpening: DialogOpening;
  dispatchSync: (action: ProjectAction) => void;
  onError?: (error: ProjectError) => void;
};

/**
 * directory dialog から project を開き、tasks / columns を一貫した ProjectData として state に反映する。
 *
 * @param deps openProject に必要な queue / version / dispatch 依存
 */
export const openProjectAction = async ({
  projectVersion,
  projectCommandQueue,
  dialogOpening,
  dispatchSync,
  onError,
}: OpenProjectActionDeps): Promise<void> => {
  if (dialogOpening.current) {
    return;
  }
  dialogOpening.current = true;

  const dialogResult = await openDirectoryDialog();
  dialogOpening.current = false;

  if (!projectVersion.active) {
    return;
  }

  if (!dialogResult.ok) {
    onError?.({ kind: "tauri", error: dialogResult.error });
    return;
  }

  const path = dialogResult.value;
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
  });
};
