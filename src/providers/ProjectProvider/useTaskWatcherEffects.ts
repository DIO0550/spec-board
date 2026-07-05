import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { Task, type TaskPayload } from "@/types/task";
import type { ProjectAction } from "./reducer";
import type { ProjectState } from "./state/projectState";

/** useTaskWatcherEffects が受け取る依存。 */
type TaskWatcherDeps = {
  /** 現在 loaded な project path（未 loaded は null）。 */
  loadedPath: string | null;
  /** 最新 state を同期的に読む getter（= store.getState）。 */
  getState: () => ProjectState;
  /**
   * store への dispatcher（= store.dispatch）。
   * @param action 反映する ProjectAction
   */
  dispatch: (action: ProjectAction) => void;
};

/**
 * registerListen が受け取る payload ハンドラ。
 * @param payload listen event の payload
 */
type ListenHandler<T> = (payload: T) => void;

/**
 * 単一の Tauri event listen を登録し、購読解除関数を返す共通ヘルパ。
 * listen 登録は非同期に解決するため、解決前に cleanup された場合（unlistened）は
 * 解決後の unlisten を即時実行して stale 購読を残さない。
 *
 * @param eventName 購読する Tauri event 名
 * @param handler payload を受け取るハンドラ
 * @returns 購読解除関数（effect の cleanup にそのまま return できる）
 */
const registerListen = <T>(
  eventName: string,
  handler: ListenHandler<T>,
): (() => void) => {
  let unlistened = false;
  let unlistenFn: UnlistenFn | null = null;
  listen<T>(eventName, (event) => {
    // listen Promise 解決前に cleanup 済みになった場合、まだ unlistenFn を取得できて
    // いないため stale handler が発火しうる。unlistened flag で早期 return して
    // unmount / project 切替後の遅延イベントによる二重反映を防ぐ。
    if (unlistened) {
      return;
    }
    handler(event.payload);
  })
    .then((fn) => {
      if (unlistened) {
        fn();
        return;
      }
      unlistenFn = fn;
    })
    .catch(() => {
      // listen 登録自体が失敗した場合は購読を諦める。
      // 失敗は user action と紐づかないため通知せず黙殺する。
    });
  return () => {
    unlistened = true;
    if (unlistenFn) {
      unlistenFn();
      unlistenFn = null;
    }
  };
};

/**
 * loaded な project の task ファイル変更（created / updated / deleted）を Tauri
 * event で購読し、capturedPath ガードを通過した変更だけ store へ dispatch する
 * Provider 内 private hook。listen callback は `getState()` で「今の state」を同期的に
 * 読み、project 切替・unmount 時は effect の再登録 / cleanup で購読を張り替える。
 *
 * @param deps loadedPath / getState / dispatch
 */
export const useTaskWatcherEffects = ({
  loadedPath,
  getState,
  dispatch,
}: TaskWatcherDeps): void => {
  useEffect(() => {
    if (loadedPath === null) {
      return;
    }
    const capturedPath = loadedPath;
    return registerListen<{ task: TaskPayload }>("task-created", (payload) => {
      if (!payload?.task) {
        return;
      }
      const current = getState();
      if (current.kind !== "loaded" || current.path !== capturedPath) {
        return;
      }
      const task = Task.fromPayload(payload.task);
      dispatch({ type: "task-created", task });
    });
  }, [loadedPath, getState, dispatch]);

  useEffect(() => {
    if (loadedPath === null) {
      return;
    }
    const capturedPath = loadedPath;
    return registerListen<{ task: TaskPayload }>("task-updated", (payload) => {
      if (!payload?.task) {
        return;
      }
      const current = getState();
      if (current.kind !== "loaded" || current.path !== capturedPath) {
        return;
      }
      const task = Task.fromPayload(payload.task);
      dispatch({
        type: "task-updated",
        originalFilePath: payload.task.filePath,
        task,
      });
    });
  }, [loadedPath, getState, dispatch]);

  useEffect(() => {
    if (loadedPath === null) {
      return;
    }
    const capturedPath = loadedPath;
    return registerListen<{ filePath: string }>("task-deleted", (payload) => {
      if (typeof payload?.filePath !== "string") {
        return;
      }
      const current = getState();
      if (current.kind !== "loaded" || current.path !== capturedPath) {
        return;
      }
      dispatch({ type: "task-deleted", filePath: payload.filePath });
    });
  }, [loadedPath, getState, dispatch]);
};
