/** DeleteFlow state machine の状態 */
export type DeleteFlowState =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "deleting" }
  | { kind: "error"; reason: unknown };

/**
 * 任意 kind の type guard を生成する factory。
 * @param kind - 判定対象の kind
 * @returns ガード関数
 */
const isKind =
  <K extends DeleteFlowState["kind"]>(kind: K) =>
  (state: DeleteFlowState): state is Extract<DeleteFlowState, { kind: K }> =>
    state.kind === kind;

const isIdle = isKind("idle");
const isConfirming = isKind("confirming");
const isDeleting = isKind("deleting");
const isError = isKind("error");

/**
 * 不正遷移時のヘルパー。dev 環境では console.warn を出力し、state はそのまま返す。
 * @param event - イベント名
 * @param state - 現在の state
 * @returns state そのまま
 */
const invalidTransition = (
  event: string,
  state: DeleteFlowState,
): DeleteFlowState => {
  if (import.meta.env.DEV) {
    console.warn(`Invalid DeleteFlow transition: ${event} from ${state.kind}`);
  }
  return state;
};

/**
 * DeleteFlow state machine の event companion。
 * 状態遷移自体は引数のみに基づいて決まるが、不正遷移時のみ dev 環境では
 * `invalidTransition` 経由で `console.warn` を出力する（prod では完全に副作用なし）。
 */
export const DeleteFlow = {
  /**
   * idle → confirming（削除確認ダイアログを開く）。
   * @param state - 現在の state
   * @returns 新しい state
   */
  request: (state: DeleteFlowState): DeleteFlowState => {
    if (!isIdle(state)) return invalidTransition("request", state);
    return { kind: "confirming" };
  },

  /**
   * confirming/error → idle（キャンセル）。deleting 中は no-op で吸収。
   * @param state - 現在の state
   * @returns 新しい state
   */
  cancel: (state: DeleteFlowState): DeleteFlowState => {
    if (!isConfirming(state) && !isError(state))
      return invalidTransition("cancel", state);
    return { kind: "idle" };
  },

  /**
   * confirming/error → deleting（削除実行を開始）。deleting 中は no-op で吸収。
   * @param state - 現在の state
   * @returns 新しい state
   */
  confirm: (state: DeleteFlowState): DeleteFlowState => {
    if (!isConfirming(state) && !isError(state))
      return invalidTransition("confirm", state);
    return { kind: "deleting" };
  },

  /**
   * deleting → idle（削除成功）。
   * @param state - 現在の state
   * @returns 新しい state
   */
  succeed: (state: DeleteFlowState): DeleteFlowState => {
    if (!isDeleting(state)) return invalidTransition("succeed", state);
    return { kind: "idle" };
  },

  /**
   * deleting → error（削除失敗）。reason を保持してダイアログ維持。
   * @param state - 現在の state
   * @param payload - 失敗理由
   * @returns 新しい state
   */
  fail: (
    state: DeleteFlowState,
    payload: { reason: unknown },
  ): DeleteFlowState => {
    if (!isDeleting(state)) return invalidTransition("fail", state);
    return { kind: "error", reason: payload.reason };
  },
} as const;
