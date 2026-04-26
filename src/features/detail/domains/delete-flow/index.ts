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
  (
    current: DeleteFlowState,
  ): current is Extract<DeleteFlowState, { kind: K }> =>
    current.kind === kind;

const isIdle = isKind("idle");
const isConfirming = isKind("confirming");
const isDeleting = isKind("deleting");
const isError = isKind("error");

/**
 * 不正遷移時のヘルパー。dev 環境では console.warn を出力し、state はそのまま返す。
 * @param event - イベント名
 * @param current - 現在の state
 * @returns state そのまま
 */
const invalidTransition = (
  event: string,
  current: DeleteFlowState,
): DeleteFlowState => {
  if (import.meta.env.DEV) {
    console.warn(
      `Invalid DeleteFlow transition: ${event} from ${current.kind}`,
    );
  }
  return current;
};

/**
 * DeleteFlow state machine の event + selector companion。
 * 状態遷移自体は引数のみに基づいて決まるが、不正遷移時のみ dev 環境では
 * `invalidTransition` 経由で `console.warn` を出力する（prod では完全に副作用なし）。
 */
export const DeleteFlow = {
  /**
   * `request` 遷移が許される state かどうか（idle のみ）。
   * @param current - 現在の state
   * @returns idle なら true
   */
  canRequest: (current: DeleteFlowState): boolean => isIdle(current),

  /**
   * `cancel` 遷移が許される state かどうか（confirming/error）。
   * @param current - 現在の state
   * @returns confirming または error なら true
   */
  canCancel: (current: DeleteFlowState): boolean =>
    isConfirming(current) || isError(current),

  /**
   * `confirm` 遷移が許される state かどうか（confirming/error）。
   * hook 側の事前ガードに使う。
   * @param current - 現在の state
   * @returns confirming または error なら true
   */
  canConfirm: (current: DeleteFlowState): boolean =>
    isConfirming(current) || isError(current),

  /**
   * idle → confirming（削除確認ダイアログを開く）。
   * @param current - 現在の state
   * @returns 新しい state
   */
  request: (current: DeleteFlowState): DeleteFlowState => {
    if (!isIdle(current)) return invalidTransition("request", current);
    return { kind: "confirming" };
  },

  /**
   * confirming/error → idle（キャンセル）。idle/deleting 中は state そのまま返し、
   * dev 環境では `invalidTransition` 経由で `console.warn` を出力する（prod は完全 no-op）。
   * @param current - 現在の state
   * @returns 新しい state
   */
  cancel: (current: DeleteFlowState): DeleteFlowState => {
    if (!isConfirming(current) && !isError(current))
      return invalidTransition("cancel", current);
    return { kind: "idle" };
  },

  /**
   * confirming/error → deleting（削除実行を開始）。idle/deleting 中は state そのまま返し、
   * dev 環境では `invalidTransition` 経由で `console.warn` を出力する（prod は完全 no-op）。
   * @param current - 現在の state
   * @returns 新しい state
   */
  confirm: (current: DeleteFlowState): DeleteFlowState => {
    if (!isConfirming(current) && !isError(current))
      return invalidTransition("confirm", current);
    return { kind: "deleting" };
  },

  /**
   * deleting → idle（削除成功）。
   * @param current - 現在の state
   * @returns 新しい state
   */
  succeed: (current: DeleteFlowState): DeleteFlowState => {
    if (!isDeleting(current)) return invalidTransition("succeed", current);
    return { kind: "idle" };
  },

  /**
   * deleting → error（削除失敗）。reason を保持してダイアログ維持。
   * @param current - 現在の state
   * @param payload - 失敗理由
   * @returns 新しい state
   */
  fail: (
    current: DeleteFlowState,
    payload: { reason: unknown },
  ): DeleteFlowState => {
    if (!isDeleting(current)) return invalidTransition("fail", current);
    return { kind: "error", reason: payload.reason };
  },
} as const;
