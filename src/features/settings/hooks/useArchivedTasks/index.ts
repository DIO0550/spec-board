import { useCallback, useEffect, useRef, useState } from "react";
import { getArchivedTasks, unarchiveTask } from "@/lib/tauri";
import type { ArchivedTaskPayload } from "@/lib/tauri/taskCommands/types";

/** アーカイブ一覧の取得状態。 */
export type ArchivedTasksState =
  | { kind: "loading" }
  | { kind: "loaded"; tasks: ArchivedTaskPayload[] }
  | { kind: "error" };

/** useArchivedTasks の返却値。 */
export type UseArchivedTasksResult = {
  /** 一覧の取得状態 */
  state: ArchivedTasksState;
  /** 一覧を取り直す */
  reload: () => void;
  /**
   * アーカイブ済みタスクを復元し、成功時は一覧を取り直す。
   * ボードへの反映は watcher に委ねる（復元ファイルは外部作成として届く）。
   * @param filePath - アーカイブ内相対パス
   * @returns 復元に成功したか
   */
  restore: (filePath: string) => Promise<boolean>;
};

/**
 * アーカイブ済みタスク一覧の取得と復元を担うフック。
 * マウント時と reload / restore 成功時に getArchivedTasks() を呼ぶ。
 * request 世代が一致する応答だけを採用し、後着の古い応答は捨てる。
 * @returns {@link UseArchivedTasksResult}
 */
export const useArchivedTasks = (): UseArchivedTasksResult => {
  const [state, setState] = useState<ArchivedTasksState>({ kind: "loading" });
  const requestIdRef = useRef(0);

  const reload = useCallback(() => {
    const currentId = requestIdRef.current + 1;
    requestIdRef.current = currentId;
    setState({ kind: "loading" });
    const load = async (): Promise<void> => {
      const result = await getArchivedTasks();
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
      const result = await unarchiveTask({ filePath });
      if (!result.ok) {
        return false;
      }
      reload();
      return true;
    },
    [reload],
  );

  return { state, reload, restore };
};
