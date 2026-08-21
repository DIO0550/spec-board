import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptyTrash,
  getTrashedTasks,
  purgeTrashedTask,
  restoreTrashedTask,
} from "@/lib/tauri";
import type { TrashedTaskPayload } from "@/lib/tauri/taskCommands/types";

/** ゴミ箱一覧の取得状態。 */
export type TrashedTasksState =
  | { kind: "loading" }
  | { kind: "loaded"; tasks: TrashedTaskPayload[] }
  | { kind: "error" };

/** useTrashedTasks の返却値。 */
export type UseTrashedTasksResult = {
  /** 一覧の取得状態 */
  state: TrashedTasksState;
  /** 一覧を取り直す */
  reload: () => void;
  /**
   * ゴミ箱内タスクを復元し、成功時は一覧を取り直す。
   * ボードへの反映は watcher に委ねる。
   * @param filePath - ゴミ箱内相対パス
   * @returns 復元に成功したか
   */
  restore: (filePath: string) => Promise<boolean>;
  /**
   * ゴミ箱内タスク 1 件を完全削除し、成功時は一覧を取り直す。
   * @param filePath - ゴミ箱内相対パス
   * @returns 削除に成功したか
   */
  purge: (filePath: string) => Promise<boolean>;
  /**
   * ゴミ箱を空にし、成功時は一覧を取り直す。
   * @returns 成功したか
   */
  empty: () => Promise<boolean>;
};

/**
 * ゴミ箱内タスク一覧の取得・復元・完全削除を担うフック。
 * request 世代が一致する応答だけを採用し、後着の古い応答は捨てる。
 * @returns {@link UseTrashedTasksResult}
 */
export const useTrashedTasks = (): UseTrashedTasksResult => {
  const [state, setState] = useState<TrashedTasksState>({ kind: "loading" });
  const requestIdRef = useRef(0);

  const reload = useCallback(() => {
    const currentId = requestIdRef.current + 1;
    requestIdRef.current = currentId;
    setState({ kind: "loading" });
    const load = async (): Promise<void> => {
      const result = await getTrashedTasks();
      if (requestIdRef.current !== currentId) {
        return;
      }
      if (result.ok) {
        setState({ kind: "loaded", tasks: result.value.tasks });
        return;
      }
      setState({ kind: "error" });
    };
    void load();
  }, []);

  useEffect(() => {
    reload();
    return () => {
      // アンマウント後の setState を抑止する（in-flight 応答を stale 化する）。
      requestIdRef.current += 1;
    };
  }, [reload]);

  const restore = useCallback(
    async (filePath: string): Promise<boolean> => {
      const result = await restoreTrashedTask({ filePath });
      if (!result.ok) {
        return false;
      }
      reload();
      return true;
    },
    [reload],
  );

  const purge = useCallback(
    async (filePath: string): Promise<boolean> => {
      const result = await purgeTrashedTask({ filePath });
      if (!result.ok) {
        return false;
      }
      reload();
      return true;
    },
    [reload],
  );

  const empty = useCallback(async (): Promise<boolean> => {
    const result = await emptyTrash();
    if (!result.ok) {
      return false;
    }
    reload();
    return true;
  }, [reload]);

  return { state, reload, restore, purge, empty };
};
