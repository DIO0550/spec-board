import type { UnlistenFn } from "@tauri-apps/api/event";
import type { WatcherDiagnostic } from "@/domains/watcher-diagnostic";
import type { WatcherSession } from "@/domains/watcher-session";
import type { ProjectAction } from "../reducer";
import type { ProjectState } from "../state/projectState";
import {
  parseWatcherEnvelope,
  WATCHER_BUFFER_LIMIT,
  WATCHER_EVENT_NAMES,
  type WatcherEnvelope,
  WatcherGate,
  type WatcherGateDecision,
  type WatcherGateRef,
  type WatcherResyncReason,
} from "../watcherEnvelopeGate";

/** 単一のwatcher event listenerを登録する外部依存。 */
export type WatcherListenerRegistration = (
  eventName: string,
  handler: (payload: unknown) => void,
) => Promise<UnlistenFn>;

/** listener一式の登録結果。失敗は次のensureReadyで再試行できる。 */
export type WatcherListenerReadiness =
  | { readonly kind: "ready" }
  | { readonly kind: "failed"; readonly cause: unknown };

type WatcherEventBridgeDeps = {
  readonly register: WatcherListenerRegistration;
  readonly gate: WatcherGateRef;
  readonly getState: () => ProjectState;
  readonly dispatch: (action: ProjectAction) => void;
  readonly requestResync: (reason: WatcherResyncReason) => void;
  readonly notifyDiagnostic: (diagnostic: WatcherDiagnostic) => void;
};

/** ProjectProvider生涯でlistener readinessとevent配送を所有するcontroller。 */
export type WatcherEventBridge = {
  /**
   * listener一式の登録完了を待つ。
   * @returns 全listenerが登録済みならready、1件でも失敗すればfailed
   */
  readonly ensureReady: () => Promise<WatcherListenerReadiness>;
  /**
   * Provider mount中の常設購読を開始する。
   * @returns 現registration世代を停止するcleanup
   */
  readonly start: () => () => void;
  /**
   * open中eventのbufferingを開始する。
   * @param openRequest open request世代
   */
  readonly beginOpen: (openRequest: number) => void;
  /**
   * loaded stateとgate baselineを確定し、queueをreplayする。
   * @param openRequest open request世代
   * @param session open応答のwatcher session
   * @param commitLoaded loaded stateを同期commitするcallback
   */
  readonly commitOpen: (
    openRequest: number,
    session: WatcherSession,
    commitLoaded: () => void,
  ) => void;
  /**
   * open失敗後に復元済みsessionへqueueをreplayする。
   * @param openRequest open request世代
   */
  readonly abortOpen: (openRequest: number) => void;
  /** reset時にactive openとqueueを破棄する。 */
  readonly reset: () => void;
};

type DecisionSinks = Pick<
  WatcherEventBridgeDeps,
  "dispatch" | "requestResync" | "notifyDiagnostic"
>;

/**
 * gateのdecisionをstore・再取得・診断通知へ配送する。
 * @param decision gateが返した判定
 * @param sinks 配送先
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
    if (decision.alsoResync !== undefined) {
      sinks.requestResync(decision.alsoResync);
    }
    return;
  }
  const action = WatcherGate.toAction(decision.envelope);
  if (action !== null) {
    sinks.dispatch(action);
  }
};

type ActiveOpen = {
  readonly token: number;
  readonly queue: readonly WatcherEnvelope[];
  readonly overflowed: boolean;
};

const stoppedRegistrationError = (): Error =>
  new Error("watcher listener registration was stopped");

/**
 * watcher listenerの常設登録controllerを作る。
 *
 * @param deps Tauri listener登録とevent配送先
 * @returns Provider生涯でstableに保持するbridge
 */
export const createWatcherEventBridge = (
  deps: WatcherEventBridgeDeps,
): WatcherEventBridge => {
  let registrationGeneration = 0;
  let registrationPromise: Promise<WatcherListenerReadiness> | null = null;
  let activeUnlistens: readonly UnlistenFn[] = [];
  let activeOpen: ActiveOpen | null = null;

  /**
   * parse済みenvelopeを現在のloaded sessionへ配送する。
   * @param envelope 配送するenvelope
   */
  const deliverEnvelope = (envelope: WatcherEnvelope): void => {
    const current = deps.getState();
    if (current.kind !== "loaded") {
      return;
    }
    const nextStep = WatcherGate.receive(deps.gate.current, envelope);
    deps.gate.current = nextStep.state;
    applyDecision(nextStep.decision, deps);
  };

  /**
   * listener payloadを検証し、open中はqueue、それ以外はgateへ配送する。
   * @param eventName Tauri event名
   * @param raw 未検証payload
   */
  const receive = (eventName: string, raw: unknown): void => {
    const envelope = parseWatcherEnvelope(eventName, raw);
    if (envelope === null) {
      return;
    }
    if (activeOpen === null) {
      deliverEnvelope(envelope);
      return;
    }
    if (activeOpen.overflowed) {
      return;
    }
    if (activeOpen.queue.length >= WATCHER_BUFFER_LIMIT) {
      activeOpen = { ...activeOpen, queue: [], overflowed: true };
      return;
    }
    activeOpen = {
      ...activeOpen,
      queue: [...activeOpen.queue, envelope],
    };
  };

  /** 現在登録済みのlistenerをすべて解除する。 */
  const unlistenAll = (): void => {
    activeUnlistens.forEach((unlisten) => {
      unlisten();
    });
    activeUnlistens = [];
  };

  /**
   * 5つのlistenerを同じ世代として登録する。
   * @returns registration一式の結果
   */
  const registerAll = (): Promise<WatcherListenerReadiness> => {
    const generation = registrationGeneration + 1;
    registrationGeneration = generation;
    const pending = WATCHER_EVENT_NAMES.map((eventName) =>
      deps.register(eventName, (payload) => receive(eventName, payload)),
    );

    return Promise.allSettled(pending).then((results) => {
      const successfulUnlistens = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      if (generation !== registrationGeneration) {
        successfulUnlistens.forEach((unlisten) => {
          unlisten();
        });
        return {
          kind: "failed",
          cause: stoppedRegistrationError(),
        };
      }

      const failed = results.find((result) => result.status === "rejected");
      if (failed !== undefined) {
        successfulUnlistens.forEach((unlisten) => {
          unlisten();
        });
        registrationPromise = null;
        return { kind: "failed", cause: failed.reason };
      }

      activeUnlistens = successfulUnlistens;
      return { kind: "ready" };
    });
  };

  /** 全listenerのregistrationを一度だけ開始する。 */
  const ensureReady = (): Promise<WatcherListenerReadiness> => {
    if (registrationPromise !== null) {
      return registrationPromise;
    }
    registrationPromise = registerAll();
    return registrationPromise;
  };

  /**
   * 現registration世代を停止する。
   * pending Promiseが後から成功した場合も世代不一致側で即時unlistenされる。
   */
  const stop = (): void => {
    registrationGeneration += 1;
    registrationPromise = null;
    unlistenAll();
    activeOpen = null;
  };

  /** mount時に登録を先行開始し、cleanupを返す。 */
  const start = (): (() => void) => {
    void ensureReady();
    return stop;
  };

  /**
   * queueを既存gateへFIFO replayする。
   * @param completed 完了したopenのqueue
   */
  const replay = (completed: ActiveOpen): void => {
    if (completed.overflowed) {
      deps.requestResync("event-gap");
      return;
    }
    completed.queue.forEach((envelope) => {
      deliverEnvelope(envelope);
    });
  };

  /** open中bufferingを新しいrequest tokenで開始する。 */
  const beginOpen = (openRequest: number): void => {
    activeOpen = {
      token: openRequest,
      queue: [],
      overflowed: false,
    };
  };

  /** loaded commit・gate baseline・FIFO replayを同じcall stackで実行する。 */
  const commitOpen = (
    openRequest: number,
    session: WatcherSession,
    commitLoaded: () => void,
  ): void => {
    if (activeOpen?.token !== openRequest) {
      return;
    }
    const completed = activeOpen;
    activeOpen = null;
    commitLoaded();
    deps.gate.current = WatcherGate.init(session);
    replay(completed);
  };

  /** open失敗後、復元済みstateと旧gateへqueueをreplayする。 */
  const abortOpen = (openRequest: number): void => {
    if (activeOpen?.token !== openRequest) {
      return;
    }
    const completed = activeOpen;
    activeOpen = null;
    replay(completed);
  };

  /** active openのqueueとoverflow latchを破棄する。 */
  const reset = (): void => {
    activeOpen = null;
  };

  return {
    ensureReady,
    start,
    beginOpen,
    commitOpen,
    abortOpen,
    reset,
  };
};
