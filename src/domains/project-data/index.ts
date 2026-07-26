import type { ProjectColumnsChange } from "@/domains/project-columns";
import { TaskHierarchy } from "@/domains/task-hierarchy";
import { TaskLinks } from "@/domains/task-links";
import { parentReferencesTaskPath } from "@/domains/task-path";
import {
  TaskProjection,
  type TaskProjectionMap,
} from "@/domains/task-projection";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";

export type ProjectData = {
  tasks: Task[];
  columns: Column[];
  doneColumn?: string;
  /**
   * filePath -> projection（BE 集計）。tasks の差分更新に対しては stale になりうる。
   * `useProjectionSyncEffect` が `get_tasks` 応答で丸ごと差し替える。
   */
  projections: TaskProjectionMap;
  /**
   * この ProjectData がどの `open_project` 応答に由来するかを表す識別子。
   * `concurrency.beginOpenRequest()` の採番値をそのまま載せる。
   *
   * projection 再同期が「open 直後の fresh な payload」と「open 失敗による
   * 旧 project の復元」を区別するために使う。path だけでは区別できない
   * （`openFail` は `previousLoaded` を同じ path のまま `loaded` へ戻すため）。
   */
  openRequestId: number;
};

/**
 * 新旧 projection map をマージする。
 *
 * 参照の据え置きは 4 段（エントリ / map / ProjectData / ProjectState）で行い、
 * この helper は前 2 段を担う。map を丸ごと差し替えると、map を capture した
 * `BoardCardProvider` の `useCallback` が毎回新しくなり context 値が変わるため、
 * 全カードの `useMemo` が miss して board 全体が再レンダーする。
 *
 * - 値が等価なエントリは旧オブジェクトの参照を引き継ぐ
 * - 全エントリが等価かつ件数も同じなら `prev` インスタンスをそのまま返す
 *
 * 件数比較を含めるのは、`next` 側がすべて等価でも `prev` にだけ存在する余分な
 * キーが残るケース（task 削除）を取りこぼさないため。
 * @param prev - 直前の projection map
 * @param next - get_tasks が返した新しい projection map
 * @returns 変化が無ければ `prev` そのもの、あれば未変更エントリが旧参照の新 Map
 */
const mergeProjections = (
  prev: TaskProjectionMap,
  next: TaskProjectionMap,
): TaskProjectionMap => {
  const merged = new Map<string, TaskProjection>();
  let unchanged = prev.size === next.size;
  for (const [filePath, projection] of next) {
    const previous = prev.get(filePath);
    if (previous !== undefined && TaskProjection.equals(previous, projection)) {
      merged.set(filePath, previous);
      continue;
    }
    unchanged = false;
    merged.set(filePath, projection);
  }
  if (unchanged) {
    return prev;
  }
  return merged;
};

/**
 * 2 つの filePath 配列が同じ並びかを判定する。
 * @param left - 比較対象
 * @param right - 比較対象
 * @returns 要素数と各要素がすべて一致すれば true
 */
const sameFilePaths = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left === right ||
  (left.length === right.length &&
    left.every((filePath, index) => filePath === right[index]));

/**
 * 更新後 task を、既存エントリの派生値（子一覧）を保ったまま合成する。
 *
 * BE payload の `children` は経路によって空になる。watcher の `handle_upsert` は
 * `task_from_parsed`（`children: []`）をそのまま emit し、`parent` を変えない
 * `update_task` も同じ値を返す。そのまま採用すると、親タスクを 1 文字編集した
 * だけで `<details>` の子リストとサブ Issue 行が消える。
 *
 * 単一 task の更新は「その task を親とする子の集合」を変えない。子集合が変わるのは
 * 他 task の created / parent 変更 / deleted のときで、いずれも
 * `applyTaskCreated` / `syncParentChildren` / `detachChildFromOldParent` /
 * `applyTaskDeleted` が親側を patch している。したがって既存値の保持が常に正しい。
 * BE 側で `overwrite_preserving_derived` が派生値を保持しているのと同じ判断。
 *
 * `parentFilePath` は payload 側を採用する（parent の真実源は payload）。
 * `reverseLinks` は `add_link` / `remove_link` の意味論に踏み込むためここでは触らない。
 * @param previous - 差し替え前の既存エントリ
 * @param updated - BE から受け取った更新後 task
 * @returns 子一覧を保持した合成結果
 */
const mergeUpdatedTask = (previous: Task, updated: Task): Task => {
  if (
    sameFilePaths(
      previous.hierarchy.childFilePaths,
      updated.hierarchy.childFilePaths,
    )
  ) {
    // 子一覧が実質同じなら `updated` をそのまま返す。`moveTask` の確定段は
    // 「楽観 dispatch した Task が state にそのまま入っている」ことを参照同一性で
    // 判定するため、ここで無条件に新オブジェクトを作ると外部更新が入ったと誤判定され、
    // BE 応答（書き込み後の再解析結果）が捨てられる。
    return updated;
  }
  return {
    ...updated,
    hierarchy: {
      ...updated.hierarchy,
      childFilePaths: previous.hierarchy.childFilePaths,
    },
  };
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
      current.filePath === originalFilePath
        ? mergeUpdatedTask(current, task)
        : current,
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
   * BE から再取得した projection を丸ごと差し替える。
   * tasks / columns には触れない（tasks の真実源は差分更新経路のまま）。
   *
   * 全エントリが等価なら **`data` そのもの**を返す。ここで `{ ...data }` を返すと
   * `ProjectState.updateData` が新 state を作り、`store.dispatch` が listener を
   * 無条件に通知して全ツリーが再レンダーする。
   * @param data - 現在の ProjectData
   * @param projections - 再取得した projection map
   * @returns 変化が無ければ `data` そのもの、あれば projection だけ差し替えた新 ProjectData
   */
  replaceProjections: (
    data: ProjectData,
    projections: TaskProjectionMap,
  ): ProjectData => {
    const merged = mergeProjections(data.projections, projections);
    if (merged === data.projections) {
      return data;
    }
    return { ...data, projections: merged };
  },

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
