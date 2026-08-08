import type { ProjectData } from "@/domains/project-data";
import { WatcherSession } from "@/domains/watcher-session";
import type { GetTasksPayload } from "@/lib/tauri";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { ResyncRequest } from "../resyncRequests";
import type { ProjectState } from "../state/projectState";

/** 捨てるが、状況が落ち着けばもう一度読み直すべき理由。 */
export type ResyncRefetchReason =
  /** 読み取り中に mutation が commit した。採用すると確定済みの変更を巻き戻す。 */
  "changed-while-reading";

/** 捨てて終わりにする理由。 */
export type ResyncDropReason =
  /** 新しい要求に追い越された。 */
  | "newer-request-exists"
  /** `get_tasks` が失敗した。 */
  | "fetch-failed"
  /** project が切り替わった（未 load を含む）。 */
  | "project-changed"
  /** 同一 path のまま watcher が張り直された。 */
  | "generation-changed"
  /** 応答の session が現在の gate の session と別物。 */
  | "session-changed";

/** 採否判定の結果。 */
export type ResyncSnapshotResolution =
  /** 採用してよい。`data` は判定に使った loaded state の ProjectData。 */
  | {
      readonly kind: "use";
      readonly snapshot: GetTasksPayload;
      readonly data: ProjectData;
    }
  | { readonly kind: "refetch"; readonly reason: ResyncRefetchReason }
  | { readonly kind: "drop"; readonly reason: ResyncDropReason };

/** 採否判定の入力。発行時に捕捉した値と、応答時点の現在値を並べて渡す。 */
export type ResyncSnapshotInput = {
  /** 発行時の token。 */
  readonly request: ResyncRequest;
  /** 応答時点の `ResyncRequestsState.lastRequestId`。 */
  readonly currentRequestId: number;
  /** 読み取り開始時点の queue 末尾（barrier が返した tail）。 */
  readonly queueAtRead: Promise<unknown>;
  /** 応答時点の queue 末尾。 */
  readonly queueNow: Promise<unknown>;
  /** `get_tasks` の結果。 */
  readonly result: Result<GetTasksPayload, TauriError>;
  /** 応答時点の store state。 */
  readonly state: ProjectState;
  /** 応答時点の gate の session。 */
  readonly gateSession: WatcherSession | null;
};

/**
 * `get_tasks` 応答をどう扱うかを決める。
 *
 * 判定順は固定で、上にあるものほど「後続の比較が意味を持たなくなる」条件。
 * 順序を入れ替えると、同じ状況に対して返る理由名が変わる。
 * @param input 発行時の捕捉値と応答時点の現在値
 * @returns 使う / 取り直す / 捨てる
 */
export const resolveResyncSnapshot = (
  input: ResyncSnapshotInput,
): ResyncSnapshotResolution => {
  const { request, result, state, gateSession } = input;
  if (input.currentRequestId !== request.id) {
    return { kind: "drop", reason: "newer-request-exists" };
  }
  if (input.queueNow !== input.queueAtRead) {
    return { kind: "refetch", reason: "changed-while-reading" };
  }
  if (!result.ok) {
    return { kind: "drop", reason: "fetch-failed" };
  }
  if (state.kind !== "loaded" || state.path !== request.path) {
    return { kind: "drop", reason: "project-changed" };
  }
  // gate に session が無い場合もここで落とす。session が消えているなら発行時の
  // 世代はもう現行ではなく、後段の同一性判定にかける意味がないため。
  if (gateSession === null || gateSession.generation !== request.generation) {
    return { kind: "drop", reason: "generation-changed" };
  }
  if (!WatcherSession.isSameSession(gateSession, result.value.session)) {
    return { kind: "drop", reason: "session-changed" };
  }
  return { kind: "use", snapshot: result.value, data: state.data };
};
