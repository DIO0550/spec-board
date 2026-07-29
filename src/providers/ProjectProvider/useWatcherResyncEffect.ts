import { useCallback, useRef } from "react";
import { WatcherSession } from "@/domains/watcher-session";
import { getTasks } from "@/lib/tauri";
import { awaitProjectCommands, type ProjectCommandQueue } from "./concurrency";
import type { ProjectAction } from "./reducer";
import type { ProjectState } from "./state/projectState";
import type { ProjectionSyncedRef } from "./useProjectionSyncEffect";
import type { WatcherGateRef } from "./useTaskWatcherEffects";
import {
  WatcherGate,
  type WatcherGateDecision,
  type WatcherResyncReason,
} from "./watcherEnvelopeGate";

/**
 * read barrier を待ち直す上限。
 *
 * mutation が連続して enqueue され続けると tail が安定しない。無限に待つと
 * 再取得が永久に始まらないため、打ち切って「取り直し」に倒す（次の試行で
 * 落ち着いていれば読める）。
 */
const BARRIER_MAX_ATTEMPTS = 5;

/** 発行中の 1 本を表す token。放棄された旧世代が新世代の gate を開けるのを防ぐ。 */
type ActiveRequest = {
  /** `requestIdRef` の採番値。応答の採否判定に使う。 */
  id: number;
  /** 発行時点の loaded path。project 切替時の放棄判定に使う。 */
  path: string;
  /** 発行時点の watcher generation。同一 path の再オープンを取りこぼさない。 */
  generation: number;
};

/** useWatcherResyncEffect が受け取る依存。 */
type WatcherResyncDeps = {
  /** 現在 loaded な project path（未 loaded は null）。 */
  loadedPath: string | null;
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
};

/**
 * Rescan / revision gap を受けて `get_tasks` で snapshot を再取得し、gate の buffer を
 * replay する Provider 内 private hook。
 *
 * - single in-flight。要求が重なった場合は pending に畳み、応答後に 1 本だけ再発行する
 * - `awaitProjectCommands` で in-flight mutation を追い越さない
 * - 採否は `requestId` 一致 / `loadedPath` 一致に加えて **generation ガード**も見る。
 *   path だけだと同一 path の再オープンを取りこぼす
 * - 応答の session が現行と別なら dispatch しない。gate 自体は状態を変えない契約だが、
 *   本 hook は `finally` で `resyncFailed` を通して `resyncing` から必ず抜ける。
 *   generation が変わっていれば初期化 effect が `init()` で自己回復するが、それを
 *   待たずに済ませる方が「二度と resync が出ない」故障モードから遠い
 * - 解放は必ず `finally` で通す（採否と解放を別レイヤにする）
 *
 * # 失敗時（**この経路が無いと board が恒久フリーズする**）
 *
 * `invoke` が Err を返した場合・例外が飛んだ場合・バリア後に中断した場合は、必ず
 * `WatcherGate.resyncFailed` を通して `status` を `synced` に戻す。gate を
 * `resyncing` のまま残すと、以後の envelope はすべて buffer 行に落ちて `resync`
 * decision が二度と出ないため、`requestResync` が再発行されず board が一切更新
 * されなくなる。通知は出さない（自動再取得は無通知の既定方針）が、**次の watcher
 * event が gap を検出して自動的に再試行する**ので手動操作は不要。
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
 * `requestIdRef` による stale 応答破棄のイディオムは `useProjectionSyncEffect` /
 * `useLabels` / `useMilestones` に既に 3 実装あり、本 hook は 4 実装目になる。
 * ただし `useLabels` / `useMilestones` は single-in-flight でも read barrier 付きでも
 * ないため、そのまま共通化すると最も要件の緩い実装に引きずられて「Rescan 連発でも
 * IPC を積み上げない」要件を満たせない。共通化は follow-up 候補として残す。
 *
 * # 未解決事項（follow-up）
 *
 * in-flight の `projections-refreshed` が遅れて着地して projection を巻き戻す経路は
 * marker 共有では解決しない（marker は新規発行を抑えるだけで、既に飛んでいる応答には
 * 効かない）。影響は projection のみ・次の sync で自動回復するため本 issue では扱わない。
 *
 * @param deps loadedPath / gate / queue / projectionSynced / getState / dispatch
 * @returns 再取得を要求する callback（gate の decision から呼ぶ）
 */
export const useWatcherResyncEffect = ({
  loadedPath,
  gate,
  projectCommandQueue,
  projectionSynced,
  getState,
  dispatch,
}: WatcherResyncDeps): ((reason: WatcherResyncReason) => void) => {
  const requestIdRef = useRef(0);
  const activeRef = useRef<ActiveRequest | null>(null);
  const pendingRef = useRef(false);

  const requestResync = useCallback(
    (_reason: WatcherResyncReason): void => {
      const session = gate.current.session;
      if (loadedPath === null || session === null) {
        return;
      }
      // 旧 project / 旧世代の要求が未解決でも、新 session の復旧を塞がない。
      // 放棄した要求の finalizer は下の identity チェックで no-op になる。
      const active = activeRef.current;
      if (
        active !== null &&
        (active.path !== loadedPath || active.generation !== session.generation)
      ) {
        activeRef.current = null;
        pendingRef.current = false;
      }
      // 先行リクエストが解決するまで畳む（トレーリング 1 本だけを後で出す）。
      if (activeRef.current !== null) {
        pendingRef.current = true;
        return;
      }
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      const request: ActiveRequest = {
        id: requestId,
        path: loadedPath,
        generation: session.generation,
      };
      activeRef.current = request;
      // 応答待ちのあいだに届く cache 変更を必ず buffer させる。ここを通さないと
      // buffer 溢れ由来の 2 本目で「即時 apply → 古い snapshot で上書き」が起きる。
      gate.current = WatcherGate.resyncStarted(gate.current);

      const runResync = async (): Promise<void> => {
        let applied: ReturnType<typeof WatcherGate.snapshotApplied> | null =
          null;
        // 読み取り中に mutation が commit したため snapshot を捨てた場合に立つ。
        // 失敗ではないので即座に取り直す。
        let supersededByMutation = false;
        try {
          // commit 前 snapshot を読まない（queue は占有しない read barrier）。
          //
          // barrier は「呼び出した時点の tail」しか待たないため、待機中に enqueue
          // された mutation は待ってもらえない。tail が動かなくなるまで待ち直して
          // 「読み始める時点で未完了の mutation が無い」状態を作る。
          let barrierStable = false;
          for (let attempt = 0; attempt < BARRIER_MAX_ATTEMPTS; attempt += 1) {
            const tail = projectCommandQueue.current;
            await awaitProjectCommands(projectCommandQueue);
            if (requestIdRef.current !== request.id) {
              return;
            }
            if (projectCommandQueue.current === tail) {
              barrierStable = true;
              break;
            }
          }
          if (!barrierStable) {
            // mutation が途切れない。今読んでも古い版になるので取り直しに倒す。
            supersededByMutation = true;
            return;
          }
          // 債務はここで下ろす。barrier のあとに投げる snapshot は、待機中に
          // 立った latch の欠落まで含んでいるため。これ以降に立つ latch は
          // この snapshot では回収できない新しい欠落を表す。
          gate.current = WatcherGate.resyncIssued(gate.current);
          // 読み取り開始時点の queue 末尾。応答が返るまでに mutation が
          // enqueue されていたら、この snapshot はその commit より前の版なので
          // 採用してはならない（採用すると確定済みの変更を巻き戻す）。
          const queueAtRead = projectCommandQueue.current;
          const result = await getTasks();
          if (requestIdRef.current !== request.id) {
            return;
          }
          if (projectCommandQueue.current !== queueAtRead) {
            // 読み取り中に mutation が走った。古い snapshot は捨てて取り直す。
            supersededByMutation = true;
            return;
          }
          if (!result.ok) {
            return;
          }
          const state = getState();
          if (state.kind !== "loaded" || state.path !== request.path) {
            return;
          }
          if (gate.current.session?.generation !== request.generation) {
            return;
          }
          if (
            gate.current.session === null ||
            !WatcherSession.isSameSession(
              gate.current.session,
              result.value.session,
            )
          ) {
            return;
          }
          applied = WatcherGate.snapshotApplied(
            gate.current,
            result.value.session,
          );
          if (!applied.accepted) {
            applied = null;
            return;
          }
          gate.current = applied.state;
          dispatch({
            type: "tasks-resynced",
            tasks: result.value.tasks,
            projections: result.value.projections,
            milestoneProjections: result.value.milestoneProjections,
          });
          // marker は **replay を適用する前**の state で組む。replay の `task-*`
          // action は tasks だけを進めて projections は据え置くため、replay 後の
          // state を「同期済み」と記録すると、古い projections が最新扱いになって
          // 進捗バッジが stale のまま固定される。replay で tasks が変われば marker
          // と一致しなくなり、projection sync が必要な 1 本を投げてくれる
          // （それは無駄な取得ではなく、replay 分の集計に必要な取得）。
          rememberProjectionSync(projectionSynced, getState(), request.path);
        } finally {
          // gate は既に別 session のものに差し替わっている可能性がある。自分が
          // 発行した世代の gate だけを触る（触ると新 session の buffer を壊す）。
          const ownsGate =
            gate.current.session?.generation === request.generation;
          // 採否と無関係に必ず通る解放処理。snapshot を採用できなかった場合は
          // resyncing のまま残さない（残すと以後の envelope が全て buffer 行に落ちる）。
          if (applied === null && ownsGate) {
            gate.current = WatcherGate.resyncFailed(gate.current);
          }
          if (activeRef.current === request) {
            activeRef.current = null;
            const shouldRetry =
              pendingRef.current ||
              supersededByMutation ||
              (applied?.resyncRequired ?? false);
            pendingRef.current = false;
            applyReplayDecisions(applied?.decisions ?? [], dispatch);
            if (shouldRetry) {
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
      loadedPath,
      gate,
      projectCommandQueue,
      projectionSynced,
      getState,
      dispatch,
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
