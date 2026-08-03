/** BE の `ProjectLoadWarningCode` に対応するロード警告コード。 */
export type ProjectLoadWarningCode =
  | "scanEntryError"
  | "metadataError"
  | "unreadableFile"
  | "fileTooLarge"
  | "binaryFile"
  | "invalidPath"
  | "taskReadFailed"
  | "frontmatterParseFailed"
  | "configFallback"
  | "unknown";

/** ロード警告が発生した処理段階。 */
export type ProjectLoadWarningStage =
  | "scan"
  | "read"
  | "parse"
  | "config"
  | "unknown";

/** Tauri から受け取るロード警告の入力型。未知値を受け入れて正規化する。 */
export type ProjectLoadWarningPayloadInput = {
  readonly code: string;
  readonly stage: string;
  readonly path?: string | null;
  readonly message: string;
  readonly recoverable: boolean;
};

/** プロジェクト読み込み中に発生した、処理継続可能な警告。 */
export type ProjectLoadWarning = {
  readonly code: ProjectLoadWarningCode;
  readonly stage: ProjectLoadWarningStage;
  readonly path: string | null;
  readonly message: string;
  readonly recoverable: boolean;
};

const KNOWN_CODES = [
  "scanEntryError",
  "metadataError",
  "unreadableFile",
  "fileTooLarge",
  "binaryFile",
  "invalidPath",
  "taskReadFailed",
  "frontmatterParseFailed",
  "configFallback",
  "unknown",
] as const satisfies readonly ProjectLoadWarningCode[];

const KNOWN_STAGES = [
  "scan",
  "read",
  "parse",
  "config",
  "unknown",
] as const satisfies readonly ProjectLoadWarningStage[];

/**
 * raw な code 文字列が既知の warning code かを判定する。
 * @param raw - BE から届いた code 文字列
 * @returns 既知の code なら true
 */
const isKnownCode = (raw: string): raw is ProjectLoadWarningCode =>
  (KNOWN_CODES as readonly string[]).includes(raw);

/**
 * raw な stage 文字列が既知の warning stage かを判定する。
 * @param raw - BE から届いた stage 文字列
 * @returns 既知の stage なら true
 */
const isKnownStage = (raw: string): raw is ProjectLoadWarningStage =>
  (KNOWN_STAGES as readonly string[]).includes(raw);

/**
 * 並べ替えに使う、1 件分の warning の安定キーを作る。
 * @param warning - キーを作る対象
 * @returns 全フィールドを含む決定的な文字列
 */
const warningSortKey = (warning: ProjectLoadWarning): string =>
  JSON.stringify([
    warning.code,
    warning.stage,
    warning.path,
    warning.message,
    warning.recoverable,
  ]);

/** ProjectLoadWarning の正規化・識別用 companion API。 */
export const ProjectLoadWarning = {
  /**
   * 未知の code を unknown に丸める。
   * @param raw - BE から届いた code 文字列
   * @returns 既知の code、または `unknown`
   */
  normalizeCode: (raw: string): ProjectLoadWarningCode =>
    isKnownCode(raw) ? raw : "unknown",

  /**
   * 未知の stage を unknown に丸める。
   * @param raw - BE から届いた stage 文字列
   * @returns 既知の stage、または `unknown`
   */
  normalizeStage: (raw: string): ProjectLoadWarningStage =>
    isKnownStage(raw) ? raw : "unknown",

  /**
   * raw payload を UI が扱う domain 値へ変換する。
   * @param payload - BE から受け取った warning payload
   * @returns 正規化済みの ProjectLoadWarning
   */
  fromPayload: (
    payload: ProjectLoadWarningPayloadInput,
  ): ProjectLoadWarning => ({
    code: ProjectLoadWarning.normalizeCode(payload.code),
    stage: ProjectLoadWarning.normalizeStage(payload.stage),
    path: payload.path ?? null,
    message: payload.message,
    recoverable: payload.recoverable,
  }),

  /**
   * 警告 code の安定した日本語表示名を返す。
   * @param code - 正規化済みの warning code
   * @returns 表示用のラベル
   */
  codeLabel: (code: ProjectLoadWarningCode): string => {
    const labels: Record<ProjectLoadWarningCode, string> = {
      scanEntryError: "走査エラー",
      metadataError: "メタデータ取得失敗",
      unreadableFile: "読み取り不可",
      fileTooLarge: "ファイルサイズ超過",
      binaryFile: "バイナリファイル",
      invalidPath: "無効なパス",
      taskReadFailed: "タスク読み取り失敗",
      frontmatterParseFailed: "フロントマター解析失敗",
      configFallback: "設定の既定値適用",
      unknown: "読み込み警告",
    };
    return labels[code];
  },

  /**
   * 警告 stage の安定した日本語表示名を返す。
   * @param stage - 正規化済みの warning stage
   * @returns 表示用のラベル
   */
  stageLabel: (stage: ProjectLoadWarningStage): string => {
    const labels: Record<ProjectLoadWarningStage, string> = {
      scan: "走査",
      read: "読み取り",
      parse: "解析",
      config: "設定",
      unknown: "不明",
    };
    return labels[stage];
  },

  /**
   * 同じ警告集合かどうかを参照に依存せず判定するための安定 fingerprint。
   * @param warnings - 比較対象の warning 集合
   * @returns 並び順に依存しない決定的な文字列
   */
  fingerprint: (warnings: readonly ProjectLoadWarning[]): string =>
    JSON.stringify(
      [...warnings]
        .map(warningSortKey)
        .sort()
        .map((key) => JSON.parse(key) as unknown[]),
    ),
} as const;
