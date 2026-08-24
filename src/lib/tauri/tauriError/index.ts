/**
 * Tauri ラッパ層から運ばれる正規化済みエラー分類コード。
 */
export type TauriErrorCode =
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "IO_ERROR"
  | "PARSE_ERROR"
  | "HAS_CHILDREN"
  | "INVALID_FILE_NAME"
  /** invoke前の公開引数検証に失敗した。 */
  | "INVALID_ARGUMENT"
  /** 他の変更が先に入っていたため操作が拒否された。巻き戻して取り直す。 */
  | "CONFLICT"
  | "UNKNOWN";

/** watcher backend障害の機械可読な分類。 */
export type WatcherInitFailureKind =
  | "watchPathUnavailable"
  | "resourceExhausted"
  | "permissionDenied"
  | "io"
  | "unknown";

/** 単一watcher backendの起動失敗診断。 */
export type WatcherInitFailure = Readonly<{
  kind: WatcherInitFailureKind;
  paths: readonly string[];
  detail: string;
}>;

/** recommended/poll両backendの起動失敗診断。 */
export type WatcherInitDiagnostics = Readonly<{
  recommended: WatcherInitFailure;
  poll: WatcherInitFailure;
}>;

const FALLBACK_MESSAGE = "不明なエラーが発生しました";

const PATTERNS: ReadonlyArray<{
  readonly regex: RegExp;
  readonly code: TauriErrorCode;
}> = [
  { regex: /見つかりません|not found/i, code: "NOT_FOUND" },
  { regex: /アクセスできません|permission/i, code: "PERMISSION_DENIED" },
  { regex: /\bio\b|i\/o|読み取り|書き込み/i, code: "IO_ERROR" },
  { regex: /\bparse\b|フロントマター/i, code: "PARSE_ERROR" },
  { regex: /task has children/i, code: "HAS_CHILDREN" },
  { regex: /invalid file name/i, code: "INVALID_FILE_NAME" },
  // BE の MoveTaskError::StatusMismatch / CardOrderConflict の文言に対応する。
  // どちらも「他の変更が先に入った」ことを表すため同じコードに寄せる。
  { regex: /並びが変わっています|状態が変わっています/, code: "CONFLICT" },
];

/**
 * 任意の reject 値からメッセージ文字列を抽出する。
 * @param raw 任意の reject 値
 * @returns 抽出されたメッセージ。抽出不能なら null
 */
const extractMessage = (raw: unknown): string | null => {
  if (raw instanceof Error) {
    return raw.message;
  }
  if (typeof raw === "string") {
    return raw;
  }
  if (
    typeof raw === "object" &&
    raw !== null &&
    "message" in raw &&
    typeof (raw as { message: unknown }).message === "string"
  ) {
    return (raw as { message: string }).message;
  }
  return null;
};

/**
 * 値がnullでないobject recordかを判定する。
 * @param value 判定対象
 * @returns recordとして安全にfield参照できる場合true
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * 値が文字列かを判定する。
 * @param value 判定対象
 * @returns 文字列の場合true
 */
const isString = (value: unknown): value is string => typeof value === "string";

/**
 * watcher failure kindを既知集合へ正規化する。
 * @param kind backendから受け取ったkind
 * @returns 既知kind、未知値ならunknown
 */
const normalizeWatcherFailureKind = (kind: string): WatcherInitFailureKind => {
  switch (kind) {
    case "watchPathUnavailable":
    case "resourceExhausted":
    case "permissionDenied":
    case "io":
    case "unknown":
      return kind;
    default:
      return "unknown";
  }
};

/**
 * 単一backendの起動失敗診断を検証・正規化する。
 * @param raw 診断候補
 * @returns 有効な診断。不正形状ならnull
 */
const normalizeWatcherFailure = (raw: unknown): WatcherInitFailure | null => {
  if (!isRecord(raw)) {
    return null;
  }
  const { kind, paths, detail } = raw;
  if (
    typeof kind !== "string" ||
    !Array.isArray(paths) ||
    !paths.every(isString) ||
    typeof detail !== "string"
  ) {
    return null;
  }
  return {
    kind: normalizeWatcherFailureKind(kind),
    paths: [...paths],
    detail,
  };
};

/**
 * Tauri reject値からrecommended/poll両診断を抽出する。
 * @param raw Tauriがrejectした値
 * @returns 有効な両backend診断。不在・不正形状ならundefined
 */
const normalizeWatcherInit = (
  raw: unknown,
): WatcherInitDiagnostics | undefined => {
  if (!isRecord(raw) || !("watcherInit" in raw)) {
    return undefined;
  }
  const diagnostics = raw.watcherInit;
  if (!isRecord(diagnostics)) {
    return undefined;
  }
  const recommended = normalizeWatcherFailure(diagnostics.recommended);
  const poll = normalizeWatcherFailure(diagnostics.poll);
  if (recommended === null || poll === null) {
    return undefined;
  }
  return { recommended, poll };
};

/**
 * メッセージ文字列を最小限のパターンマッチで TauriErrorCode に分類する。
 * 既知パターンに該当しない場合は UNKNOWN にフォールバック。
 * @param message 分類対象メッセージ
 * @returns 対応する TauriErrorCode
 */
const classifyCode = (message: string): TauriErrorCode => {
  const matched = PATTERNS.find((p) => p.regex.test(message));
  return matched ? matched.code : "UNKNOWN";
};

/**
 * Tauri ラッパ層の正規化済みエラー。`Error` を継承し、`code` / `message` / `cause` を保持する。
 * 任意の reject 値 (unknown) からの正規化は static factory `TauriError.from(raw)` を使う。
 */
export class TauriError extends Error {
  /** エラー分類コード */
  readonly code: TauriErrorCode;
  /** 元の reject 値（dev tools 参照用） */
  readonly cause?: unknown;
  /** この error を生んだ Tauri コマンド名（invokeWrapped が付与）。allowlist 判定に使う。 */
  readonly command?: string;
  /** watcherの両backend起動失敗時だけ付与される機械可読な診断。 */
  readonly watcherInit?: WatcherInitDiagnostics;

  /**
   * @param code エラー分類コード
   * @param message 人間可読メッセージ
   * @param cause 元の reject 値（任意）
   * @param command 起点となった Tauri コマンド名（任意）
   * @param watcherInit watcher backend別の起動失敗診断（任意）
   */
  constructor(
    code: TauriErrorCode,
    message: string,
    cause?: unknown,
    command?: string,
    watcherInit?: WatcherInitDiagnostics,
  ) {
    super(message);
    this.name = "TauriError";
    this.code = code;
    this.cause = cause;
    this.command = command;
    this.watcherInit = watcherInit;
  }

  /**
   * 任意の reject 値を TauriError へ正規化する。
   * - Error: `error.message` を採用 / cause に元 Error を保持
   * - string: 文字列をそのまま message に採用 / cause に文字列を保持
   * - { message: string }: その文字列を message に採用 / cause にオブジェクトを保持
   *   - 有効な `watcherInit` があればbackend別診断も保持
   *   - 未知のfailure kindは`unknown`、不正な診断形状はmetadataなしへfallback
   * - 上記以外（null / number / 空オブジェクト等）: 既定メッセージ + UNKNOWN
   *
   * code 判定は本 Issue では最小限の文字列パターンマッチのみ（マッチ不能は UNKNOWN）。
   *
   * @param raw invoke が reject した任意の値
   * @param command 起点となった Tauri コマンド名（任意）。invokeWrapped から渡される
   * @returns 正規化済み TauriError（cause === raw, command を保持）
   */
  static from(raw: unknown, command?: string): TauriError {
    const extracted = extractMessage(raw);
    const message = extracted ?? FALLBACK_MESSAGE;
    const code = extracted === null ? "UNKNOWN" : classifyCode(extracted);
    return new TauriError(
      code,
      message,
      raw,
      command,
      normalizeWatcherInit(raw),
    );
  }
}
