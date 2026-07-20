import type { ProjectColumnsChange } from "@/domains/project-columns";
import { TaskHierarchy } from "@/domains/task-hierarchy";
import { TaskLinks } from "@/domains/task-links";
import { parentReferencesTaskPath } from "@/domains/task-path";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";

export type ProjectData = {
  tasks: Task[];
  columns: Column[];
  doneColumn?: string;
};

/**
 * task の status に column rename を適用する。
 *
 * @param tasks 対象 task 配列
 * @param renames 適用する column rename 一覧
 * @returns status を rename 済みの task 配列
 */
const applyRenamesToTasks = (
  tasks: Task[],
  renames: NonNullable<ProjectColumnsChange["renames"]>,
): Task[] => {
  return renames.reduce<Task[]>(
    (acc, { from, to }) =>
      acc.map((task) =>
        task.status === from ? { ...task, status: to } : task,
      ),
    tasks,
  );
};

/**
 * 親 task の children に作成された child task を追加する。
 *
 * @param tasks 作成済み child を含む task 配列
 * @param parentFilePath child task が参照する parent filePath
 * @param childFilePath 作成された child task の filePath
 * @returns parent が存在すれば children 同期後の task 配列
 */
const syncParentChildren = (
  tasks: Task[],
  parentFilePath: string | undefined,
  childFilePath: string,
): Task[] => {
  if (parentFilePath === undefined) {
    return tasks;
  }

  return tasks.map((current) => {
    if (
      !parentReferencesTaskPath(parentFilePath, current.filePath) ||
      current.hierarchy.childFilePaths.includes(childFilePath)
    ) {
      return current;
    }

    return {
      ...current,
      hierarchy: {
        ...current.hierarchy,
        childFilePaths: [...current.hierarchy.childFilePaths, childFilePath],
      },
    };
  });
};

/**
 * 作成タスクの forward link 先 target に reverse link を冪等追加する。
 * BE の `insert_new_task_into_cache` による target 側 `reverse_links` 更新に対応する
 * FE 側 optimistic 反映。これが無いと target の reverse は再 open まで stale になる。
 *
 * @param tasks 同期対象のタスク配列
 * @param linkedFilePaths 作成タスクの forward link 先 filePath 配列
 * @param createdFilePath 作成タスクの filePath
 * @returns reverse link を反映したタスク配列
 */
const syncCreatedTaskReverseLinks = (
  tasks: Task[],
  linkedFilePaths: readonly string[],
  createdFilePath: string,
): Task[] => {
  if (linkedFilePaths.length === 0) {
    return tasks;
  }

  const targets = new Set(linkedFilePaths);
  return tasks.map((current) => {
    if (!targets.has(current.filePath)) {
      return current;
    }
    if (current.links.reverseLinkedFilePaths.includes(createdFilePath)) {
      return current;
    }
    return {
      ...current,
      links: {
        ...current.links,
        reverseLinkedFilePaths: [
          ...current.links.reverseLinkedFilePaths,
          createdFilePath,
        ],
      },
    };
  });
};

/**
 * 2 つの parentFilePath が同じ task path を指すか判定する。
 * `parentReferencesTaskPath` は path 正規化（`./`, `\\` 差）を吸収する。
 *
 * @param a 比較対象 A（undefined 可）
 * @param b 比較対象 B（undefined 可）
 * @returns 同じ path を指す or 両方 undefined のとき true
 */
const parentReferencesEquivalent = (
  a: string | undefined,
  b: string | undefined,
): boolean => {
  if (a === undefined && b === undefined) {
    return true;
  }
  if (a === undefined || b === undefined) {
    return false;
  }
  return parentReferencesTaskPath(a, b);
};

/**
 * 旧親 task の children から付け替え済み child の filePath を除去する。
 *
 * @param tasks 現在の task 配列
 * @param oldParentFilePath 旧 parent filePath（無ければ no-op）
 * @param childFilePath 付け替えられた child の filePath
 * @returns 旧親の children から child を除いた task 配列
 */
const detachChildFromOldParent = (
  tasks: Task[],
  oldParentFilePath: string | undefined,
  childFilePath: string,
): Task[] => {
  if (oldParentFilePath === undefined) {
    return tasks;
  }

  return tasks.map((current) => {
    if (
      !parentReferencesTaskPath(oldParentFilePath, current.filePath) ||
      !current.hierarchy.childFilePaths.includes(childFilePath)
    ) {
      return current;
    }

    return {
      ...current,
      hierarchy: {
        ...current.hierarchy,
        childFilePaths: current.hierarchy.childFilePaths.filter(
          (fp) => fp !== childFilePath,
        ),
      },
    };
  });
};

/**
 * 削除済み path への参照を hierarchy / links から取り除いた `Task` を返す。
 * @param task 整合させる task
 * @param filePath 削除済み task の filePath
 * @returns 参照を取り除いた task（変化がなければ元 task と同一参照）
 */
const applyTaskDeletedToTask = (task: Task, filePath: string): Task =>
  TaskLinks.removeLinkedTask(
    TaskHierarchy.detachDeletedTask(task, filePath),
    filePath,
  );

export const ProjectData = {
  /**
   * 作成された task を追加し、親 task の children も同期する。
   *
   * @param data 現在の ProjectData
   * @param task 作成された task
   * @returns task 追加後の ProjectData
   */
  applyTaskCreated: (data: ProjectData, task: Task): ProjectData => {
    const tasksWithCreated = [...data.tasks, task];
    const tasksWithParentSync = syncParentChildren(
      tasksWithCreated,
      task.hierarchy.parentFilePath,
      task.filePath,
    );
    const tasksWithReverseSync = syncCreatedTaskReverseLinks(
      tasksWithParentSync,
      task.links.linkedFilePaths,
      task.filePath,
    );
    return { ...data, tasks: tasksWithReverseSync };
  },

  /**
   * originalFilePath を lookup key として task を差し替える。
   *
   * @param data 現在の ProjectData
   * @param originalFilePath 更新前 task の filePath
   * @param task 更新後 task
   * @returns task 更新後の ProjectData
   */
  applyTaskUpdated: (
    data: ProjectData,
    originalFilePath: string,
    task: Task,
  ): ProjectData => {
    const previous = data.tasks.find((t) => t.filePath === originalFilePath);

    // previous が無いケース（late / out-of-order な task-updated event）は
    // tasks に挿入されないので、parent-sync で他 task の childFilePaths に
    // dangling な参照を作らないよう no-op で返す（呼び出し時の data をそのまま）。
    if (previous === undefined) {
      return data;
    }

    const oldParent = previous.hierarchy.parentFilePath;
    const newParent = task.hierarchy.parentFilePath;
    const parentUnchanged = parentReferencesEquivalent(oldParent, newParent);
    const filePathChanged = originalFilePath !== task.filePath;

    const replaced = data.tasks.map((current) =>
      current.filePath === originalFilePath ? task : current,
    );

    // 親が同値かつ filePath も不変なら他 task 参照は触らない。
    if (parentUnchanged && !filePathChanged) {
      return { ...data, tasks: replaced };
    }

    // 旧親からの除去は必ず originalFilePath（旧パス）で行う。
    // rename 時に新パスで detach するとゴーストが残る。
    const detached = detachChildFromOldParent(
      replaced,
      oldParent,
      originalFilePath,
    );
    // 新親への登録は新 filePath（rename 後の値）を使う。
    // parent が変わらない rename のみのケースでも、旧親の childFilePaths を
    // 新パスへ更新するために旧親→新親の経路を辿る。
    const synced = syncParentChildren(detached, newParent, task.filePath);
    return { ...data, tasks: synced };
  },

  /**
   * task を削除し、親子関係と link / reverseLink から参照を掃除する。
   *
   * @param data 現在の ProjectData
   * @param filePath 削除する task の filePath
   * @returns task 削除後の ProjectData
   */
  applyTaskDeleted: (data: ProjectData, filePath: string): ProjectData => {
    const tasks = data.tasks
      .filter((task) => task.filePath !== filePath)
      .map((task) => applyTaskDeletedToTask(task, filePath));
    return { ...data, tasks };
  },

  /**
   * columns を置き換え、rename に応じて task status と doneColumn を追従する。
   *
   * @param data 現在の ProjectData
   * @param change 適用する column 変更
   * @returns column 更新後の ProjectData
   */
  replaceColumns: (
    data: ProjectData,
    change: ProjectColumnsChange,
  ): ProjectData => {
    const renamed = applyRenamesToTasks(data.tasks, change.renames ?? []);
    const renameMap = new Map(
      (change.renames ?? []).map(({ from, to }) => [from, to]),
    );
    const followedDone =
      data.doneColumn !== undefined
        ? (renameMap.get(data.doneColumn) ?? data.doneColumn)
        : undefined;
    return {
      ...data,
      tasks: renamed,
      columns: change.columns,
      doneColumn: change.doneColumn ?? followedDone,
    };
  },

  /**
   * backend から再取得した doneColumn を ProjectData に反映する。
   *
   * @param data 現在の ProjectData
   * @param doneColumn 再取得した doneColumn
   * @returns doneColumn 更新後の ProjectData
   */
  refreshDoneColumn: (data: ProjectData, doneColumn: string): ProjectData => ({
    ...data,
    doneColumn,
  }),

  /**
   * 指定カラム内のタスクを filePaths の順序で並べ替える。
   *
   * - 対象カラム外のタスク順序は維持
   * - filePaths に含まれない対象カラム内タスクは末尾に元出現順で配置
   * - tasks.length は変化しない
   *
   * @param data 元 ProjectData
   * @param columnName 並べ替え対象のカラム名
   * @param filePaths 期待する並び順（先頭が最上位）
   * @returns 並び替え後の ProjectData
   */
  applyCardOrderUpdated: (
    data: ProjectData,
    columnName: string,
    filePaths: readonly string[],
  ): ProjectData => {
    const inColumn = data.tasks.filter((t) => t.status === columnName);
    if (inColumn.length === 0) {
      return data;
    }
    const inColumnByFilePath = new Map(inColumn.map((t) => [t.filePath, t]));
    const ordered: Task[] = [];
    const seen = new Set<string>();
    for (const filePath of filePaths) {
      const task = inColumnByFilePath.get(filePath);
      if (task !== undefined) {
        ordered.push(task);
        seen.add(filePath);
      }
    }
    for (const task of inColumn) {
      if (!seen.has(task.filePath)) {
        ordered.push(task);
      }
    }
    let cursor = 0;
    const tasks = data.tasks.map((task) => {
      if (task.status !== columnName) {
        return task;
      }
      const next = ordered[cursor];
      cursor += 1;
      return next ?? task;
    });
    return { ...data, tasks };
  },
} as const;
