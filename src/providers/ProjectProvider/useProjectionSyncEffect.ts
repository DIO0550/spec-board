import { useEffect, useRef, useState } from "react";
import type { ProjectLoadWarning } from "@/domains/project-load-warning";
import { getTasks } from "@/lib/tauri";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";
import { awaitProjectCommands, type ProjectCommandQueue } from "./concurrency";
import type { ProjectAction } from "./reducer";
import type { ProjectState } from "./state/projectState";

/** 再同期の基準。3 つすべてが同期済みマーカーと一致していれば再取得しない。 */
type SyncBasis = {
  /** 現在表示中の tasks。参照が変われば集計対象が変わる。 */
  tasks: readonly Task[];
  /**
   * 現在の columns。**並び替えでは tasks も doneColumn 文字列も変わらない**が、
   * BE の `resolved_done_column()`（末尾カラムフォールバック）の結果は変わるため、
   * 配列参照を基準に含める。
   */
  columns: readonly Column[];
  /** 現在の完了カラム名（未解決なら undefined）。 */
  doneColumn: string | undefined;
};

/** 同期済みマーカー。どの open 由来のどの basis まで同期したかを覚える。 */
export type SyncedMarker = SyncBasis & {
  /** `ProjectData.openRequestId`。open 失敗による復元と新規 open を区別する。 */
  openRequestId: number;
  path: string;
};

/**
 * 発行中の 1 本を表す token。真偽値ではなくオブジェクトで持つことで、
 * 放棄された旧世代の finalizer が新世代の gate を開けるのを防ぐ。
 */
type ActiveRequest = {
  /** `requestIdRef` の採番値。応答の採否判定に使う。 */
  id: number;
  /** 発行時点の loaded path。project 切替時の放棄判定に使う。 */
  path: string;
  /** 発行時点の basis。採用時に marker へ書き戻す。 */
  basis: SyncBasis;
};

/**
 * 同期済み marker の ref。Provider が所有し `useWatcherResyncEffect` と共有する。
 * watcher の resync が適用した snapshot をここへ書き戻すことで、同じ内容で
 * 2 本目の `get_tasks` が飛ぶのを防ぐ。
 */
export type ProjectionSyncedRef = { current: SyncedMarker | null };

/** useProjectionSyncEffect が受け取る依存。 */
type ProjectionSyncDeps = SyncBasis & {
  /** 現在 loaded な project path（loading / idle / error は null）。 */
  loadedPath: string | null;
  /**
   * 現在の `ProjectData.openRequestId`。未 loaded のときは null。
   * これが変わったときだけ「新しい open payload なので fresh」と扱う。
   */
  openRequestId: number | null;
  /**
   * project command queue。`get_tasks` の直前に末尾を await して、
   * 楽観 dispatch 起点の再同期が in-flight mutation を追い越さないようにする。
   */
  projectCommandQueue: ProjectCommandQueue;
  /**
   * 同期済み marker。Provider が所有し `useWatcherResyncEffect` とも共有する。
   * 本 hook のロジックは変えず、marker の所有権だけを外に出している。
   */
  synced: ProjectionSyncedRef;
  /** 最新 state を同期的に読む getter（= store.getState）。 */
  getState: () => ProjectState;
  /**
   * store への dispatcher（= store.dispatch）。
   * @param action - 反映する ProjectAction
   */
  dispatch: (action: ProjectAction) => void;
  /** 採用したsnapshotのロード警告を通知する。 */
  notifyLoadWarnings?: (warnings: ProjectLoadWarning[], path: string) => void;
};

/**
 * tasks の差分更新（watcher event / mutation 戻り値 / 楽観 dispatch）やカラム設定の
 * 変更で stale になった task / milestone projections を `get_tasks` で
 * 同一 snapshot として再同期する Provider 内 private hook。
 *
 * # 再同期のトリガ
 *
 * `tasks` 参照 / `columns` 参照 / `doneColumn` の 3 点組。projections の完了判定は
 * BE の `Config::resolved_done_column()` に依存するため、tasks が同一参照でも
 * カラム設定が変われば集計結果が変わる。とくに**カラム並び替えでは tasks 参照も
 * doneColumn 文字列も変わらない**ので、`columns` の配列参照まで見ないと
 * 末尾カラムフォールバックの変化を取りこぼし、両 map が恒久的に stale になる。
 *
 * # open の鮮度判定
 *
 * `loadedPath` は open 中 `null` になるが、`ProjectState` は `previousLoaded` を
 * 保持し続け、その `data` は loading 中も更新される。さらに open 失敗時は
 * `previousLoaded` を**同じ path のまま** `loaded` へ復元する。したがって
 * 「loading になったら marker を捨てる」設計だと、復元後に「open 直後で fresh」と
 * 誤判定して恒久 stale になる。marker には `ProjectData.openRequestId` を含め、
 * **その値が変わったときだけ**「新しい open payload なので fresh」と扱う。
 *
 * # in-flight mutation との順序
 *
 * 楽観 dispatch は `enqueueProjectCommand` の中で起きるため、そこから発火した
 * `get_tasks` は BE の commit 前の snapshot を読みうる。`awaitProjectCommands` で
 * queue 末尾を待ってから発行する（queue は占有しないので後続 mutation は遅れない）。
 *
 * # IPC 本数と応答の採否
 *
 * `activeRef` / `pendingRef` で要求を畳む（single in-flight）。in-flight 中の要求は
 * pending に倒し、応答後に最新基準で 1 本だけ再発行する。**採否**（`requestIdRef`
 * 一致 / kind / path / `result.ok`）と**解放**（gate を開け pending を排出する）は
 * 別レイヤで、解放は success / error / stale / barrier 後の中断 / 例外のすべてを
 * `finally` で通す。ここを分けないと、stale 応答で早期 return したときに pending が
 * 排出されず再同期が恒久的に止まる。逆に解放を cleanup 側でやると、in-flight が
 * 残ったまま次の要求を発行する二重発行になる。
 *
 * # 既存慣習からの逸脱
 *
 * 設定系リソースのように `reload()` を公開して mutation 側から呼ぶ設計は採らない。
 * mutation action 6 箇所 / watcher hook 3 箇所への挿し忘れが恒久的な stale を生む
 * ため、state の変化を単一のトリガとして自動再取得する。
 *
 * 失敗時は通知を出さず旧 projections を据え置く。読み取り系 IPC の失敗は App 側で
 * 通知するのがこの codebase の既定方針だが、本 hook はユーザー操作を伴わない
 * 自動再取得であり、失敗しても進捗表示が旧値のまま残るだけで編集操作は成立する
 * ため、あえて逸脱して無通知にする。
 * @param deps - loadedPath / openRequestId / tasks / columns / doneColumn / queue / getState / dispatch
 */
export const useProjectionSyncEffect = ({
  loadedPath,
  openRequestId,
  tasks,
  columns,
  doneColumn,
  projectCommandQueue,
  synced: syncedRef,
  getState,
  dispatch,
  notifyLoadWarnings,
}: ProjectionSyncDeps): void => {
  // 各再同期リクエストに採番する世代 id。最新世代の応答だけが state を確定する。
  const requestIdRef = useRef(0);
  // 発行中の 1 本（null = gate が開いている）。IPC 本数の畳み込み用で、
  // 世代ガード（応答の採否）とは役割が別。
  const activeRef = useRef<ActiveRequest | null>(null);
  const pendingRef = useRef(false);
  // 応答完了後に effect を再実行するためのトリガ。
  const [syncTick, setSyncTick] = useState(0);
  // unmount 後に setSyncTick を呼ばないためのガード。
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  useEffect(() => {
    // `syncTick` は値としては使わず、in-flight 解放後に effect を再実行させるためだけの
    // 依存。畳み込んだトレーリング 1 本はこの再実行で最新の basis を読んで発行される。
    void syncTick;

    // 依存変更 / unmount 時に世代 id を進め、未解決の応答を「採用しない」側へ倒す。
    // gate の解放は行わない（解放は必ず finally 側で、token の同一性を見て行う）。
    const discardInFlight = (): void => {
      requestIdRef.current += 1;
    };

    // loading / idle / error。marker には触らない（loading は一時状態であって
    // reset ではない。触ると open 失敗→復元のあとに fresh と誤判定する）。
    if (loadedPath === null || openRequestId === null) {
      return discardInFlight;
    }

    // 旧 project の要求が未解決でも、新 project の同期を塞がない。
    // 放棄された request の finalizer は activeRef の同一性チェックで no-op になる。
    if (activeRef.current !== null && activeRef.current.path !== loadedPath) {
      activeRef.current = null;
      pendingRef.current = false;
    }

    const syncedMarker = syncedRef.current;
    // 新しい open payload。両 projections は最新なので fetch せず marker だけ更新する。
    if (syncedMarker === null || syncedMarker.openRequestId !== openRequestId) {
      syncedRef.current = {
        openRequestId,
        path: loadedPath,
        tasks,
        columns,
        doneColumn,
      };
      return discardInFlight;
    }
    if (
      syncedMarker.path === loadedPath &&
      syncedMarker.tasks === tasks &&
      syncedMarker.columns === columns &&
      syncedMarker.doneColumn === doneColumn
    ) {
      return discardInFlight;
    }
    // 先行リクエストが解決するまで畳む（トレーリング 1 本だけを後で出す）。
    if (activeRef.current !== null) {
      pendingRef.current = true;
      return discardInFlight;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const request: ActiveRequest = {
      id: requestId,
      path: loadedPath,
      basis: { tasks, columns, doneColumn },
    };
    activeRef.current = request;

    const runSync = async (): Promise<void> => {
      try {
        // commit 前 snapshot を読まない（queue は占有しない read barrier）。
        await awaitProjectCommands(projectCommandQueue);
        if (requestIdRef.current !== request.id) {
          return;
        }
        const result = await getTasks();
        if (requestIdRef.current !== request.id) {
          return;
        }
        if (!result.ok) {
          // marker を更新しないので、次の変化 / pending で再試行される。
          return;
        }
        const state = getState();
        if (state.kind !== "loaded" || state.path !== request.path) {
          return;
        }
        dispatch({
          type: "projections-refreshed",
          projections: result.value.projections,
          milestoneProjections: result.value.milestoneProjections,
          taskTree: result.value.taskTree,
        });
        dispatch({
          type: "load-warnings-replaced",
          loadWarnings: result.value.loadWarnings,
        });
        notifyLoadWarnings?.(result.value.loadWarnings, request.path);
        syncedRef.current = {
          openRequestId,
          path: request.path,
          ...request.basis,
        };
      } finally {
        // 採否と無関係に必ず通る解放処理。自分がまだ active 世代のときだけ
        // gate を開ける（放棄済みなら新世代の gate を触らない）。
        if (activeRef.current === request) {
          activeRef.current = null;
          const shouldRetry = pendingRef.current;
          pendingRef.current = false;
          if (shouldRetry && mountedRef.current) {
            setSyncTick((tick) => tick + 1);
          }
        }
      }
    };

    void runSync();

    return discardInFlight;
  }, [
    loadedPath,
    openRequestId,
    tasks,
    columns,
    doneColumn,
    projectCommandQueue,
    syncedRef,
    getState,
    dispatch,
    notifyLoadWarnings,
    syncTick,
  ]);
};
