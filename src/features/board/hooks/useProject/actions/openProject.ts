import {
  getColumns as getColumnsInvoke,
  openDirectoryDialog,
  openProject as openProjectInvoke,
} from "@/lib/tauri";
import {
  enqueueProjectCommand,
  invalidateProject,
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

  const version = invalidateProject(projectVersion);
  dispatchSync({ type: "open-start", path });

  await enqueueProjectCommand(projectCommandQueue, async () => {
    if (!isProjectCurrent(projectVersion, version)) {
      return;
    }

    const openResult = await openProjectInvoke({ path });
    if (!isProjectCurrent(projectVersion, version)) {
      return;
    }

    if (!openResult.ok) {
      dispatchSync({ type: "open-fail", path, error: openResult.error });
      onError?.({ kind: "tauri", error: openResult.error });
      return;
    }

    const columnsResult = await getColumnsInvoke();
    if (!isProjectCurrent(projectVersion, version)) {
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
    dispatchSync({ type: "open-succeed", path, data });
  });
};
