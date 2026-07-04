import type { ProjectData } from "./reducer";

export type {
  ColumnsCommand,
  ColumnsCommandBuilder,
} from "./actions/columnsCommand";
export type { MoveTaskCallbacks, MoveTaskParams } from "./actions/moveTask";
export type {
  ReorderColumnsCallbacks,
  ReorderColumnsEvent,
  ReorderColumnsParams,
  ReorderColumnsResult,
} from "./actions/reorderColumns";
export type { ProjectData } from "./reducer";
export type { ProjectState } from "./state/projectState";

/**
 * project の load 成功イベントの payload。
 * 開いた path と読み込んだ ProjectData を併せて渡す。
 */
export type ProjectLoadedEvent = {
  /** 開いたプロジェクトの絶対パス。 */
  path: string;
  /** 読み込んだ ProjectData（tasks / columns / doneColumn）。 */
  data: ProjectData;
};
