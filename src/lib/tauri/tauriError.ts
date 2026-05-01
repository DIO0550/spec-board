/**
 * Tauri ラッパ層から運ばれる正規化済みエラー分類コード。
 */
export type TauriErrorCode =
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "IO_ERROR"
  | "PARSE_ERROR"
  | "UNKNOWN";

const FALLBACK_MESSAGE = "不明なエラーが発生しました";

const PATTERNS: ReadonlyArray<{
  readonly regex: RegExp;
  readonly code: TauriErrorCode;
}> = [
  { regex: /見つかりません|not found/i, code: "NOT_FOUND" },
  { regex: /アクセスできません|permission/i, code: "PERMISSION_DENIED" },
  { regex: /io|読み取り|書き込み/i, code: "IO_ERROR" },
  { regex: /parse|フロントマター/i, code: "PARSE_ERROR" },
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

  /**
   * @param code エラー分類コード
   * @param message 人間可読メッセージ
   * @param cause 元の reject 値（任意）
   */
  constructor(code: TauriErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "TauriError";
    this.code = code;
    this.cause = cause;
  }

  /**
   * 任意の reject 値を TauriError へ正規化する。
   * - Error: `error.message` を採用 / cause に元 Error を保持
   * - string: 文字列をそのまま message に採用 / cause に文字列を保持
   * - { message: string }: その文字列を message に採用 / cause にオブジェクトを保持
   * - 上記以外（null / number / 空オブジェクト等）: 既定メッセージ + UNKNOWN
   *
   * code 判定は本 Issue では最小限の文字列パターンマッチのみ（マッチ不能は UNKNOWN）。
   *
   * @param raw invoke が reject した任意の値
   * @returns 正規化済み TauriError（cause === raw）
   */
  static from(raw: unknown): TauriError {
    const extracted = extractMessage(raw);
    const message = extracted ?? FALLBACK_MESSAGE;
    const code = extracted === null ? "UNKNOWN" : classifyCode(extracted);
    return new TauriError(code, message, raw);
  }
}
