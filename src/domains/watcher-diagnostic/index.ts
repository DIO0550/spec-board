/** BE の `DiagnosticCode` に対応する診断コード。 */
export type WatcherDiagnosticCode =
  | "watchPathUnavailable"
  | "resourceExhausted"
  | "permissionDenied"
  | "io"
  | "unknown"
  | "rescanFailed";

const KNOWN_CODES = [
  "watchPathUnavailable",
  "resourceExhausted",
  "permissionDenied",
  "io",
  "unknown",
  "rescanFailed",
] as const satisfies readonly WatcherDiagnosticCode[];

/** watcher 障害の通知内容（state には保持せず toast にのみ使う）。 */
export type WatcherDiagnostic = {
  readonly code: WatcherDiagnosticCode;
  readonly message: string;
  /** BE ログとの相関用 ID。 */
  readonly changeId: string;
};

/** WatcherDiagnostic の companion API。 */
export const WatcherDiagnostic = {
  /**
   * 未知の code を `"unknown"` へ丸める。
   * BE が code を増やしても通知自体は必ず出す（黙って落とさない）。
   * @param raw - envelope から取り出した code 文字列
   * @returns 既知の WatcherDiagnosticCode
   */
  normalizeCode: (raw: string): WatcherDiagnosticCode =>
    (KNOWN_CODES as readonly string[]).includes(raw)
      ? (raw as WatcherDiagnosticCode)
      : "unknown",
} as const;
