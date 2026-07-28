import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect } from "react";
import type { WatcherDiagnostic } from "@/domains/watcher-diagnostic";
import type { WatcherSession } from "@/domains/watcher-session";
import type { ProjectAction } from "./reducer";
import type { ProjectState } from "./state/projectState";
import {
  parseWatcherEnvelope,
  WATCHER_EVENT_NAMES,
  WatcherGate,
  type WatcherGateDecision,
  type WatcherGateState,
  type WatcherResyncReason,
} from "./watcherEnvelopeGate";

/** gate の可変 ref（ProjectVersion と同じ「ref で世代を持つ」既存パターン）。 */
export type WatcherGateRef = { current: WatcherGateState };

/** useTaskWatcherEffects が受け取る依存。 */
type TaskWatcherDeps = {
  /** 現在 loaded な project path（未 loaded は null）。 */
  loadedPath: string | null;
  /** open_project 応答の session。gate の baseline。 */
  session: WatcherSession | null;
  /** envelope 検証状態を保持する ref。 */
  gate: WatcherGateRef;
  /**
   * Rescan / gap を受けて snapshot 再取得を要求する。
   * @param reason 再取得の理由
   */
  requestResync: (reason: WatcherResyncReason) => void;
  /**
   * watcher backend の診断を通知する。
   * @param diagnostic 通知内容
   */
  notifyDiagnostic: (diagnostic: WatcherDiagnostic) => void;
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

/** decision を適用するための出力ポート。 */
type DecisionSinks = Pick<
  TaskWatcherDeps,
  "dispatch" | "requestResync" | "notifyDiagnostic"
>;

/**
 * gate の decision を store / 再取得 / 通知へ振り分ける。
 * @param decision gate が返した判定
 * @param sinks 出力先
 */
const applyDecision = (
  decision: WatcherGateDecision,
  sinks: DecisionSinks,
): void => {
  if (decision.kind === "resync") {
    sinks.requestResync(decision.reason);
    return;
  }
  if (decision.kind !== "apply") {
    return;
  }
  const { payload } = decision.envelope;
  if (payload.kind === "diagnostic") {
    sinks.notifyDiagnostic({
      code: payload.code,
      message: payload.message,
      changeId: decision.envelope.changeId,
    });
    // 診断の手前に欠番があった場合は通知と再取得を両方行う。
    if (decision.alsoResync !== undefined) {
      sinks.requestResync(decision.alsoResync);
    }
    return;
  }
  const action = WatcherGate.toAction(decision.envelope);
  if (action === null) {
    return;
  }
  sinks.dispatch(action);
};

/**
 * loaded な project の watcher event（task 変更 / 再取得要求 / 診断）を **単一の
 * effect** で購読し、gate の判定を経て store / 再取得 / 通知へ振り分ける
 * Provider 内 private hook。
 *
 * # 購読をまとめる理由
 *
 * gate は event 種別を跨ぐ単一の連番（`eventSeq`）と版（`revision`）を見るため、
 * 購読が event ごとに分かれていると判定順が崩れる。
 *
 * # gate の初期化を分離する理由
 *
 * 購読 effect の依存には 4 つの callback が含まれる。どれか 1 つの参照が変われば
 * effect が再実行されるため、そこで `gate.current = init(...)` すると buffer と
 * カウンタが全消去される。`get_tasks` in-flight 中に踏むと、その後の
 * `snapshotApplied` が初期化直後の gate に適用されて resync が失われ、board が
 * 凍結する。初期化は callback を依存に含めない専用 effect に置き、さらに
 * generation 比較で冪等にして二重に防ぐ。
 *
 * @param deps loadedPath / session / gate / requestResync / notifyDiagnostic / getState / dispatch
 */
export const useTaskWatcherEffects = ({
  loadedPath,
  session,
  gate,
  requestResync,
  notifyDiagnostic,
  getState,
  dispatch,
}: TaskWatcherDeps): void => {
  useEffect(() => {
    if (session === null) {
      return;
    }
    if (gate.current.session?.generation === session.generation) {
      return;
    }
    gate.current = WatcherGate.init(session);
    // 依存に callback を含めない。どれか 1 つの参照が変わるだけで gate を作り直すと、
    // in-flight resync の buffer が消えて board が凍結する。
  }, [session, gate]);

  useEffect(() => {
    if (loadedPath === null || session === null) {
      return;
    }
    const capturedPath = loadedPath;

    const handleEvent =
      (eventName: string) =>
      (raw: unknown): void => {
        const envelope = parseWatcherEnvelope(eventName, raw);
        if (envelope === null) {
          return;
        }
        // capturedPath ガードは gate の projectKey 判定とは独立の 2 段目。
        // FE 採番の loadedPath と BE 採番の projectKey は別物なので統合しない。
        const current = getState();
        if (current.kind !== "loaded" || current.path !== capturedPath) {
          return;
        }
        const step = WatcherGate.receive(gate.current, envelope);
        gate.current = step.state;
        applyDecision(step.decision, {
          dispatch,
          requestResync,
          notifyDiagnostic,
        });
      };

    const unlistens = WATCHER_EVENT_NAMES.map((name) =>
      registerListen<unknown>(name, handleEvent(name)),
    );
    return () => {
      unlistens.forEach((unlisten) => {
        unlisten();
      });
    };
    // この effect は gate を初期化しないので、依存が増えても buffer は消えない。
  }, [
    loadedPath,
    session,
    gate,
    requestResync,
    notifyDiagnostic,
    getState,
    dispatch,
  ]);
};
