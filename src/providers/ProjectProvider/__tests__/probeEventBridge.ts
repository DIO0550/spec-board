import type { ProjectEvent } from "../context";
import type { ProjectError } from "../errors";
import type { ProjectData } from "../reducer";

/**
 * ProjectProvider のドメインイベントを旧 useProject の onLoaded / onError callback へ
 * 橋渡しするテスト用ヘルパ。テストファイル本体では条件分岐を書けないため分離する。
 *
 * @param event 受信した ProjectEvent
 * @param onLoaded loaded イベントを受け取る callback（省略可）
 * @param onError open-error イベントの error を受け取る callback（省略可）
 */
export const bridgeProjectEvent = (
  event: ProjectEvent,
  onLoaded?: (payload: { path: string; data: ProjectData }) => void,
  onError?: (error: ProjectError) => void,
): void => {
  if (event.type === "loaded") {
    onLoaded?.({ path: event.path, data: event.data });
    return;
  }
  if (
    event.type === "watcher-diagnostic" ||
    event.type === "load-warnings-updated"
  ) {
    return;
  }
  onError?.(event.error);
};
