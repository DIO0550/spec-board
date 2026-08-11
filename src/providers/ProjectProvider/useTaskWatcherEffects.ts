import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import type { WatcherDiagnostic } from "@/domains/watcher-diagnostic";
import type { WatcherSession } from "@/domains/watcher-session";
import type { ProjectAction } from "./reducer";
import type { ProjectState } from "./state/projectState";
import {
  WatcherGate,
  type WatcherGateRef,
  type WatcherResyncReason,
} from "./watcherEnvelopeGate";
import {
  createWatcherEventBridge,
  type WatcherEventBridge,
  type WatcherListenerRegistration,
} from "./watcherEventBridge";

/** useTaskWatcherEffectsが受け取る依存。 */
type TaskWatcherDeps = {
  /** open_project応答のsession。gateのbaseline。 */
  readonly session: WatcherSession | null;
  /** envelope検証状態を保持するref。 */
  readonly gate: WatcherGateRef;
  /**
   * snapshot再取得を要求する。
   * @param reason 再取得理由
   */
  readonly requestResync: (reason: WatcherResyncReason) => void;
  /**
   * watcher診断を通知する。
   * @param diagnostic 通知内容
   */
  readonly notifyDiagnostic: (diagnostic: WatcherDiagnostic) => void;
  /** 最新stateを同期的に読む。 */
  readonly getState: () => ProjectState;
  /**
   * storeへactionを同期dispatchする。
   * @param action 反映するaction
   */
  readonly dispatch: (action: ProjectAction) => void;
};

const registerListener: WatcherListenerRegistration = (eventName, handler) =>
  listen<unknown>(eventName, (event) => {
    handler(event.payload);
  });

/**
 * ProjectProvider生涯で5つのwatcher eventを常設購読する。
 *
 * listener controllerはmount中stableに保ち、callbackはcommit済みの最新依存へ
 * effectで差し替える。session baselineの初期化はevent購読とは分離し、callback
 * identity変更でgateを作り直さない。
 *
 * @param deps session・gate・event配送先
 * @returns open actionと共有するwatcher event bridge
 */
export const useTaskWatcherEffects = (
  deps: TaskWatcherDeps,
): WatcherEventBridge => {
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  }, [deps]);

  const session = deps.session;
  const gate = deps.gate;
  const bridgeRef = useRef<WatcherEventBridge | null>(null);
  if (bridgeRef.current === null) {
    bridgeRef.current = createWatcherEventBridge({
      register: registerListener,
      gate: deps.gate,
      getState: () => depsRef.current.getState(),
      dispatch: (action) => depsRef.current.dispatch(action),
      requestResync: (reason) => depsRef.current.requestResync(reason),
      notifyDiagnostic: (diagnostic) =>
        depsRef.current.notifyDiagnostic(diagnostic),
    });
  }
  const bridge = bridgeRef.current;

  useEffect(() => {
    if (session === null) {
      return;
    }
    if (gate.current.session?.generation === session.generation) {
      return;
    }
    gate.current = WatcherGate.init(session);
  }, [session, gate]);

  useEffect(() => bridge.start(), [bridge]);

  return bridge;
};
