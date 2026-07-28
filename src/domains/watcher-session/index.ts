import type { Brand } from "@/types/brand";

/**
 * BE が採番する project 識別子。
 *
 * FE には既に `projectKey`（= loaded path。`openProject` へ渡した raw 文字列）と
 * いう同名の語があるが、こちらは BE の `AppState` が保持する `PathBuf` 由来で
 * 採番主体が違う。値はほぼ同じでも `canonicalize()` 適用有無まで含めた厳密一致は
 * 仮定できないため、brand で取り違えを型レベルで防ぐ。
 */
export type WatcherProjectKey = Brand<string, "WatcherProjectKey">;

/**
 * watcher event 検証の baseline。
 * `open_project` / `get_tasks` の**どちらの応答でも同じ形**で BE から届く。
 */
export type WatcherSession = {
  readonly projectKey: WatcherProjectKey;
  readonly generation: number;
  readonly revision: number;
  readonly eventSeq: number;
};

/** IPC の raw payload。型の所有権を domain に置く（`TaskProjection` と同じ方針）。 */
export type WatcherSessionPayloadInput = {
  readonly projectKey: string;
  readonly generation: number;
  readonly revision: number;
  readonly eventSeq: number;
};

/** WatcherSession の companion API。 */
export const WatcherSession = {
  /**
   * IPC の raw payload を domain 型へ変換する。
   * BE の payload 契約を信頼して素通しする（`TaskProjection.fromPayload` と同方針）。
   * @param payload - BE から受け取った session
   * @returns brand 付きの WatcherSession
   */
  fromPayload: (payload: WatcherSessionPayloadInput): WatcherSession => ({
    projectKey: payload.projectKey as WatcherProjectKey,
    generation: payload.generation,
    revision: payload.revision,
    eventSeq: payload.eventSeq,
  }),

  /**
   * 2 つの session が同一の watcher セッションを指すかを判定する。
   * revision / eventSeq は同一セッション内で進むため、identity は
   * projectKey + generation のみで見る。
   * @param left - 比較対象
   * @param right - 比較対象
   * @returns 同一セッションなら true
   */
  isSameSession: (left: WatcherSession, right: WatcherSession): boolean =>
    left.projectKey === right.projectKey &&
    left.generation === right.generation,
} as const;
