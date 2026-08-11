import { useCallback, useRef } from "react";
import type { ProjectData } from "@/domains/project-data";
import type { ProjectLoadWarning } from "@/domains/project-load-warning";
import { getTasks } from "@/lib/tauri";
import type { Column } from "@/types/column";
import type { ProjectCommandQueue } from "./concurrency";
import { ProjectCommandBarrier } from "./projectCommandBarrier";
import type { ProjectAction } from "./reducer";
import { resolveResyncSnapshot } from "./resolveResyncSnapshot";
import { ResyncGateLifecycle } from "./resyncGateLifecycle";
import { ResyncRequests, type ResyncRequestsState } from "./resyncRequests";
import type { ProjectState } from "./state/projectState";
import type { ProjectionSyncedRef } from "./useProjectionSyncEffect";
import type { WatcherGateRef } from "./watcherEnvelopeGate";
import {
  WatcherGate,
  type WatcherGateDecision,
  type WatcherResyncReason,
  type WatcherSnapshotResult,
} from "./watcherEnvelopeGate";

/**
 * read barrier を待ち直す上限。
 *
 * mutation が連続して enqueue され続けると tail が安定しない。無限に待つと
 * 再取得が永久に始まらないため、打ち切って「取り直し」に倒す（次の試行で
 * 落ち着いていれば読める）。
 */
const BARRIER_MAX_ATTEMPTS = 5;

/** store への dispatcher。 */
type ProjectDispatch = (action: ProjectAction) => void;

/**
 * 2 つの columns が board 表示上まったく同じかを返す。
 * @param current 現在 state が持つ columns
 * @param next backend から取り直した columns
 * @returns 並び・名前・order・色がすべて一致すれば true
 */
const isSameColumns = (
  current: readonly Column[],
  next: readonly Column[],
): boolean => {
  if (current.length !== next.length) {
    return false;
  }
  return current.every((column, index) => {
    const other = next[index];
    return (
      other !== undefined &&
      other.name === column.name &&
      other.order === column.order &&
      other.color === column.color
    );
  });
};

/**
 * snapshot の columns / doneColumn に変化があるときだけ dispatch する。
 *
 * `replaceColumns` は常に新しい ProjectData を返すため、無条件に dispatch すると
 * 内容が同じ resync でも board 全体が再レンダーする（`resyncTasks` が参照据え置きを
 * 徹底しているのと同じ理由）。
 *
 * @param snapshot get_tasks 応答の columns / doneColumn
 * @param data 現在の ProjectData
 * @param dispatch store への dispatcher
 */
const dispatchColumnsIfChanged = (
  snapshot: { columns: Column[]; doneColumn?: string },
  data: ProjectData,
  dispatch: ProjectDispatch,
): void => {
  const { columns, doneColumn } = snapshot;
  if (isSameColumns(data.columns, columns) && data.doneColumn === doneColumn) {
    return;
  }
  dispatch({ type: "columns-replaced", columns, doneColumn });
};

/** useWatcherResyncEffect が受け取る依存。 */
type WatcherResyncDeps = {
  /** envelope 検証状態を保持する ref。 */
  gate: WatcherGateRef;
  /** project command queue。in-flight mutation を追い越さないための read barrier。 */
  projectCommandQueue: ProjectCommandQueue;
  /**
   * `useProjectionSyncEffect` の同期済み marker（Provider 所有の ref）。
   * snapshot 適用時にここも更新して、同 hook が同じ内容で 2 本目の `get_tasks` を
   * 投げるのを防ぐ。
   */
  projectionSynced: ProjectionSyncedRef;
  /** 最新 state を同期的に読む getter（= store.getState）。 */
  getState: () => ProjectState;
  /**
   * store への dispatcher（= store.dispatch）。
   * @param action 反映する ProjectAction
   */
  dispatch: (action: ProjectAction) => void;
  /** 採用したsnapshotのロード警告を通知する。 */
  notifyLoadWarnings?: (warnings: ProjectLoadWarning[], path: string) => void;
};

/**
 * Rescan / revision gap を受けて `get_tasks` で snapshot を再取得し、gate の buffer を
 * replay する Provider 内 private hook。
 *
 * 1 本の要求は「受付 → 開始 → barrier → 発行 → 採否 → 適用 → 解放」の順に進む。
 * 各段の判断は責務ごとのモジュールが持ち、本 hook はその結果を配線するだけにする。
 *
 * - 受付と trailing 再発行: `ResyncRequests`
 * - read barrier の安定化: `ProjectCommandBarrier`
 * - 応答の採否: `resolveResyncSnapshot`
 * - gate 遷移と所有権: `ResyncGateLifecycle`
 *
 * 解放（`lifecycle.release()` と `ResyncRequests.end`）は必ず `finally` で通す。
 * 採否と解放を別レイヤにしておかないと、途中 return のたびに後始末が漏れる。
 *
 * # snapshot 採用後の marker 更新
 *
 * `dispatch({ type: "tasks-resynced", ... })` の**直後・replay より前**に
 * `getState()` から `tasks` / `columns` / `doneColumn` / `openRequestId` を読み直して
 * `projectionSynced` を組み立てる。IPC の生配列を書くと参照同一性が一致せず、
 * 2 本目の `get_tasks` 抑止が効かない（既存 hook は `synced.tasks === tasks` の
 * 参照同一性で判定し、`mergeTasks` は `prev` そのものか旧要素混在の新配列を返すため）。
 *
 * **replay の後に組んではならない**。replay の `task-*` action は tasks だけを
 * 進めて projections は据え置くので、replay 後の state を同期済みと記録すると
 * 古い projections が最新扱いになり進捗バッジが恒久的に stale になる。
 *
 * # 共通化しない理由
 *
 * stale 応答破棄のイディオムは `useProjectionSyncEffect` / `useLabels` /
 * `useMilestones` にもあるが、後ろ 2 つは single-in-flight でも read barrier 付きでも
 * ないため、そのまま共通化すると最も要件の緩い実装に引きずられて「Rescan 連発でも
 * IPC を積み上げない」要件を満たせない。`useProjectionSyncEffect` は要件が揃うが
 * trailing 再発行が `setSyncTick` に密結合しており、`ResyncRequests` への移行は
 * follow-up 候補として残す。
 *
 * # 未解決事項（follow-up）
 *
 * in-flight の `projections-refreshed` が遅れて着地して projection を巻き戻す経路は
 * marker 共有では解決しない（marker は新規発行を抑えるだけで、既に飛んでいる応答には
 * 効かない）。影響は projection のみ・次の sync で自動回復するため本 issue では扱わない。
 *
 * @param deps gate / queue / projectionSynced / getState / dispatch
 * @returns 再取得を要求する callback（gate の decision から呼ぶ）
 */
export const useWatcherResyncEffect = ({
  gate,
  projectCommandQueue,
  projectionSynced,
  getState,
  dispatch,
  notifyLoadWarnings,
}: WatcherResyncDeps): ((reason: WatcherResyncReason) => void) => {
  const requestsRef = useRef<ResyncRequestsState>(ResyncRequests.initial);

  const requestResync = useCallback(
    (_reason: WatcherResyncReason): void => {
      const current = getState();
      const session = gate.current.session;
      if (current.kind !== "loaded" || session === null) {
        return;
      }
      const begun = ResyncRequests.begin(requestsRef.current, {
        path: current.path,
        generation: session.generation,
      });
      requestsRef.current = begun.state;
      if (begun.kind === "merged") {
        return;
      }
      const request = begun.request;
      const lifecycle = ResyncGateLifecycle.forRequest(
        gate,
        request.generation,
      );
      lifecycle.start();

      const runResync = async (): Promise<void> => {
        let applied: WatcherSnapshotResult | null = null;
        // 読み取り中に mutation が commit したため snapshot を捨てた場合に立つ。
        // 失敗ではないので即座に取り直す。
        let supersededByMutation = false;
        try {
          // commit 前 snapshot を読まない（queue は占有しない read barrier）。
          const barrier = await ProjectCommandBarrier.awaitStable(
            projectCommandQueue,
            {
              maxAttempts: BARRIER_MAX_ATTEMPTS,
              isLatest: () =>
                ResyncRequests.isLatest(requestsRef.current, request),
            },
          );
          if (barrier.kind === "abandoned") {
            return;
          }
          if (barrier.kind === "unstable") {
            // mutation が途切れない。今読んでも古い版になるので取り直しに倒す。
            supersededByMutation = true;
            return;
          }
          lifecycle.issue();
          const result = await getTasks();
          const resolution = resolveResyncSnapshot({
            request,
            currentRequestId: requestsRef.current.lastRequestId,
            queueAtRead: barrier.tail,
            queueNow: projectCommandQueue.current,
            result,
            state: getState(),
            gateSession: gate.current.session,
          });
          if (resolution.kind === "refetch") {
            supersededByMutation = true;
            return;
          }
          if (resolution.kind === "drop") {
            return;
          }
          applied = lifecycle.apply(resolution.snapshot.session);
          if (applied === null) {
            return;
          }
          dispatch({
            type: "tasks-resynced",
            tasks: resolution.snapshot.tasks,
            projections: resolution.snapshot.projections,
            milestoneProjections: resolution.snapshot.milestoneProjections,
            taskTree: resolution.snapshot.taskTree,
            loadWarnings: resolution.snapshot.loadWarnings,
          });
          // columns は tasks と同一 snapshot から来る。backend の config は watcher の
          // full rescan や再オープン後の背景再スキャンでも変わり、tasks の並びは
          // その config に従うため、据え置くと「並びは新しいがカラムは古い」board で
          // 固定される。別 IPC で取り直すと 2 つの読み取りの間に走った commit を
          // またいで revision が混在するので、必ず同じ payload から取る。
          dispatchColumnsIfChanged(
            resolution.snapshot,
            resolution.data,
            dispatch,
          );
          const appliedState = getState();
          if (appliedState.kind === "loaded") {
            notifyLoadWarnings?.(
              resolution.snapshot.loadWarnings,
              request.path,
            );
          }
          // marker は **replay を適用する前**の state で組む。replay の `task-*`
          // action は tasks だけを進めて projections は据え置くため、replay 後の
          // state を「同期済み」と記録すると、古い projections が最新扱いになって
          // 進捗バッジが stale のまま固定される。replay で tasks が変われば marker
          // と一致しなくなり、projection sync が必要な 1 本を投げてくれる
          // （それは無駄な取得ではなく、replay 分の集計に必要な取得）。
          rememberProjectionSync(projectionSynced, getState(), request.path);
        } finally {
          // 採否と無関係に必ず通る解放処理。
          lifecycle.release();
          const ended = ResyncRequests.end(requestsRef.current, request, {
            supersededByMutation,
            resyncRequired: applied?.resyncRequired ?? false,
          });
          requestsRef.current = ended.state;
          if (ended.wasActive) {
            applyReplayDecisions(applied?.decisions ?? [], dispatch);
            if (ended.shouldRetry) {
              requestResyncRef.current?.("event-gap");
            }
          }
        }
      };

      // 例外は `finally` で gate を復旧させたうえでここで止める。呼び出し元は
      // watcher の listen callback なので、投げ返しても拾い手がいない。
      // 再試行は次の envelope の gap 検知に委ねる（無通知の既定方針どおり）。
      void runResync().catch(() => {});
    },
    [
      gate,
      projectCommandQueue,
      projectionSynced,
      getState,
      dispatch,
      notifyLoadWarnings,
    ],
  );

  // 再発行を finally から呼ぶために最新の callback を ref で保持する。
  const requestResyncRef = useRef<
    ((reason: WatcherResyncReason) => void) | null
  >(null);
  requestResyncRef.current = requestResync;

  return requestResync;
};

/**
 * snapshot 適用後の state から projection 同期済み marker を組み直す。
 *
 * IPC の生配列ではなく `getState()` 由来の配列参照を書く。既存 hook は参照同一性で
 * 判定するため、生配列を書くと必ず不一致になり 2 本目の `get_tasks` 抑止が効かない。
 * @param synced 更新対象の marker ref
 * @param state dispatch 後の最新 state
 * @param path 発行時点の loaded path
 */
const rememberProjectionSync = (
  synced: ProjectionSyncedRef,
  state: ProjectState,
  path: string,
): void => {
  if (state.kind !== "loaded") {
    return;
  }
  synced.current = {
    openRequestId: state.data.openRequestId,
    path,
    tasks: state.data.tasks,
    columns: state.data.columns,
    doneColumn: state.data.doneColumn,
  };
};

/**
 * buffer の畳み込みで得た decision のうち、store へ反映すべきものだけ適用する。
 * @param decisions 畳み込み結果
 * @param dispatch store への dispatcher
 */
const applyReplayDecisions = (
  decisions: readonly WatcherGateDecision[],
  dispatch: WatcherResyncDeps["dispatch"],
): void => {
  for (const decision of decisions) {
    if (decision.kind !== "apply") {
      continue;
    }
    const action = WatcherGate.toAction(decision.envelope);
    if (action === null) {
      continue;
    }
    dispatch(action);
  }
};
