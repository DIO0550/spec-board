/** LabelsInput state machine の状態（discriminated union） */
export type LabelsInputState =
  | { kind: "idle" }
  | { kind: "adding"; input: string };

/**
 * 任意の discriminated union state に対する type guard factory。
 * @param kind - 判定対象の kind 値
 * @returns state が指定 kind ならば true を返すガード関数
 */
const isKind =
  <K extends LabelsInputState["kind"]>(kind: K) =>
  (state: LabelsInputState): state is Extract<LabelsInputState, { kind: K }> =>
    state.kind === kind;

const isIdle = isKind("idle");
const isAdding = isKind("adding");

/**
 * 不正遷移時のヘルパー。dev 環境では console.warn を出力し、state はそのまま返す。
 * @param event - イベント名
 * @param state - 現在の state
 * @returns state そのまま
 */
const invalidTransition = (
  event: string,
  state: LabelsInputState,
): LabelsInputState => {
  if (import.meta.env.DEV) {
    console.warn(`Invalid LabelsInput transition: ${event} from ${state.kind}`);
  }
  return state;
};

/**
 * LabelsInput state machine の event companion。
 * 状態遷移自体は引数に基づいて決まるが、不正遷移時のみ dev 環境では
 * `invalidTransition` 経由で `console.warn` を出力する（prod では完全に副作用なし）。
 */
export const LabelsInput = {
  /**
   * idle → adding（input は空文字で初期化）。
   * @param state - 現在の state
   * @returns 新しい state
   */
  startAdding: (state: LabelsInputState): LabelsInputState => {
    if (!isIdle(state)) return invalidTransition("startAdding", state);
    return { kind: "adding", input: "" };
  },

  /**
   * adding 中の input 更新。同値なら state そのままを返して再レンダーを抑止する。
   * @param state - 現在の state
   * @param payload - 新しい入力値
   * @returns 新しい state
   */
  setInput: (
    state: LabelsInputState,
    payload: { value: string },
  ): LabelsInputState => {
    if (!isAdding(state)) return invalidTransition("setInput", state);
    if (state.input === payload.value) return state;
    return { kind: "adding", input: payload.value };
  },

  /**
   * adding → idle（キャンセル）。
   * @param state - 現在の state
   * @returns 新しい state
   */
  cancel: (state: LabelsInputState): LabelsInputState => {
    if (!isAdding(state)) return invalidTransition("cancel", state);
    return { kind: "idle" };
  },

  /**
   * adding → idle（確定）。Labels.tryAdd の呼び出しは hook 側の責務。
   * @param state - 現在の state
   * @returns 新しい state
   */
  confirm: (state: LabelsInputState): LabelsInputState => {
    if (!isAdding(state)) return invalidTransition("confirm", state);
    return { kind: "idle" };
  },
} as const;
