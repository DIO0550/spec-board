import type { ProjectData } from "@/domains/project-data";
import { WatcherSession } from "@/domains/watcher-session";
import type { GetTasksPayload } from "@/lib/tauri";
import { Result } from "@/utils/result";
import type { ResyncRequest } from "../../resyncRequests";
import type { ProjectState } from "../../state/projectState";
import type { ResyncSnapshotInput } from "../index";

export const PATH = "/home/user/specs";
export const GENERATION = 3;

/** 発行時に捕捉した token。 */
export const REQUEST: ResyncRequest = {
  id: 1,
  path: PATH,
  generation: GENERATION,
};

/**
 * baseline session を組み立てる。
 * @param overrides 差し替えるフィールド
 * @returns WatcherSession
 */
export const session = (
  overrides: Partial<{
    projectKey: string;
    generation: number;
    revision: number;
    eventSeq: number;
  }> = {},
): WatcherSession =>
  WatcherSession.fromPayload({
    projectKey: PATH,
    generation: GENERATION,
    revision: 42,
    eventSeq: 17,
    ...overrides,
  });

export const SESSION = session();

/** 現在 loaded な project の中身。採否判定は素通しするだけで中身を見ない。 */
export const DATA: ProjectData = {
  tasks: [],
  columns: [],
  projections: new Map(),
  milestoneProjections: new Map(),
  taskTree: [],
  openRequestId: 0,
  watcherSession: SESSION,
  loadWarnings: [],
};

export const LOADED: ProjectState = { kind: "loaded", path: PATH, data: DATA };

/**
 * `get_tasks` 応答の最小形を作る。
 * @param applied 応答が持つ session
 * @returns GetTasksPayload
 */
export const snapshot = (
  applied: WatcherSession = SESSION,
): GetTasksPayload => ({
  tasks: [],
  columns: [],
  projections: new Map(),
  milestoneProjections: new Map(),
  taskTree: [],
  loadWarnings: [],
  session: applied,
});

/** barrier が返した tail。同一参照であることが「読み取り中に動かなかった」印。 */
export const TAIL: Promise<unknown> = Promise.resolve();

/**
 * 「すべて一致している」判定入力を作り、必要な箇所だけ差し替える。
 * @param overrides 差し替えるフィールド
 * @returns 採否判定の入力
 */
export const input = (
  overrides: Partial<ResyncSnapshotInput> = {},
): ResyncSnapshotInput => ({
  request: REQUEST,
  currentRequestId: REQUEST.id,
  queueAtRead: TAIL,
  queueNow: TAIL,
  result: Result.ok(snapshot()),
  state: LOADED,
  gateSession: SESSION,
  ...overrides,
});
