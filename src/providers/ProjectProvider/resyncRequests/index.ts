/** 発行中の 1 本を表す token。放棄された旧世代が新世代の gate を開けるのを防ぐ。 */
export type ResyncRequest = {
  /** 採番値。応答の採否判定に使う。 */
  readonly id: number;
  /** 発行時点の loaded path。project 切替時の放棄判定に使う。 */
  readonly path: string;
  /** 発行時点の watcher generation。同一 path の再オープンを取りこぼさない。 */
  readonly generation: number;
};

/** single in-flight 制御の状態。 */
export type ResyncRequestsState = {
  /** 直近に採番した id。応答が自分のものかを比較するのに使う。 */
  readonly lastRequestId: number;
  /** 発行中の 1 本。null なら空き。 */
  readonly active: ResyncRequest | null;
  /** 発行中に重なった要求。解決後に 1 本だけ再発行する。 */
  readonly pending: boolean;
};

/** 発行対象の識別子。`begin` の入力。 */
export type ResyncTarget = {
  readonly path: string;
  readonly generation: number;
};

/** `begin` の結果。次状態と判定を分離して返す。 */
export type ResyncBegin =
  /** 発行してよい。呼び出し側は `request` で IPC を始める。 */
  | {
      readonly kind: "started";
      readonly state: ResyncRequestsState;
      readonly request: ResyncRequest;
    }
  /** 先行リクエストへ畳んだ。呼び出し側は何もせず戻る。 */
  | { readonly kind: "merged"; readonly state: ResyncRequestsState };

/** `end` の入力。要求 1 本の結末。 */
export type ResyncOutcome = {
  /** 読み取り中に mutation が commit した / barrier が安定しなかった。 */
  readonly supersededByMutation: boolean;
  /** gate が「もう 1 本必要」と判定した（buffer 溢れ・未解決 latch など）。 */
  readonly resyncRequired: boolean;
};

/** `end` の結果。 */
export type ResyncEnd = {
  readonly state: ResyncRequestsState;
  /** 自分がまだ active だったか。false なら後処理を一切してはならない。 */
  readonly wasActive: boolean;
  /** trailing 再発行の要否。`wasActive` が false なら常に false。 */
  readonly shouldRetry: boolean;
};

/** ResyncRequestsState の companion API。 */
export const ResyncRequests = {
  /** 何も発行していない初期状態。 */
  initial: {
    lastRequestId: 0,
    active: null,
    pending: false,
  } as ResyncRequestsState,

  /**
   * 新しい要求を受け付けるか、先行リクエストへ畳むかを決める。
   *
   * 旧 project / 旧世代の active が残っていても新 session の復旧を塞がない。
   * 切り離した要求の finalizer は `end` の同一性判定で no-op になる。
   * @param state 現在の要求管理状態
   * @param target 発行対象の path / generation
   * @returns 次状態と判定
   */
  begin: (state: ResyncRequestsState, target: ResyncTarget): ResyncBegin => {
    const stale =
      state.active !== null &&
      (state.active.path !== target.path ||
        state.active.generation !== target.generation);
    const active = stale ? null : state.active;
    if (active !== null) {
      return {
        kind: "merged",
        state: { ...state, active, pending: true },
      };
    }
    const id = state.lastRequestId + 1;
    const request: ResyncRequest = {
      id,
      path: target.path,
      generation: target.generation,
    };
    return {
      kind: "started",
      state: { lastRequestId: id, active: request, pending: false },
      request,
    };
  },

  /**
   * 応答がまだ自分のものかを判定する。barrier ループの中断判定に使う。
   * @param state 現在の要求管理状態
   * @param request 発行時の token
   * @returns 追い越されていなければ true
   */
  isLatest: (state: ResyncRequestsState, request: ResyncRequest): boolean =>
    state.lastRequestId === request.id,

  /**
   * 要求 1 本を解決し、trailing 再発行の要否を返す。
   * @param state 現在の要求管理状態
   * @param request 解決した要求の token
   * @param outcome 結末（取り直しの要否）
   * @returns 次状態・所有権・再発行の要否
   */
  end: (
    state: ResyncRequestsState,
    request: ResyncRequest,
    outcome: ResyncOutcome,
  ): ResyncEnd => {
    if (state.active !== request) {
      return { state, wasActive: false, shouldRetry: false };
    }
    const shouldRetry =
      state.pending || outcome.supersededByMutation || outcome.resyncRequired;
    return {
      state: { ...state, active: null, pending: false },
      wasActive: true,
      shouldRetry,
    };
  },
} as const;
