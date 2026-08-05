import type { ProjectCommandQueue, ProjectVersion } from "../concurrency";
import type { ProjectError } from "../errors";
import type { ProjectAction, ProjectData } from "../reducer";
import type { ProjectState } from "../state/projectState";
import type { WatcherResyncReason } from "../watcherEnvelopeGate";

/** ディレクトリダイアログの二重オープンを防ぐための mutable フラグ。 */
export type DialogOpening = {
  current: boolean;
};

/**
 * task / column 系 action が共通で受け取る依存。
 * project 世代トークン・command queue・最新 state getter・dispatcher を束ねる。
 */
export type TaskActionDeps = {
  projectVersion: ProjectVersion;
  projectCommandQueue: ProjectCommandQueue;
  /** 最新の project state を返す getter。 */
  getState: () => ProjectState;
  /**
   * store に同期的に action を投げる dispatcher。
   * @param action 反映する ProjectAction
   */
  dispatch: (action: ProjectAction) => void;
  /**
   * 他の変更が先に入っていて操作が拒否されたときに、最新状態の取り直しを要求する。
   *
   * Provider 生涯で不変な deps に載せるため、実体は ref 経由の間接呼び出しにする
   * （`useWatcherResyncEffect` の戻り値は loadedPath に依存して identity が変わる）。
   *
   * @param reason 取り直しの理由（診断・ログで区別するため）
   */
  readonly requestResync: (reason: WatcherResyncReason) => void;
};

/**
 * openProject / openProjectByPath action が受け取る依存。
 */
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
   * store に同期的に action を投げる dispatcher。
   * @param action 反映する ProjectAction
   */
  dispatch: (action: ProjectAction) => void;
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
