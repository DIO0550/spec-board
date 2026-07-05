import type { TauriError } from "@/lib/tauri/tauriError";

const HAS_CHILDREN_MESSAGE = "子タスクが存在するため削除できません";

const INVALID_FILE_NAME_MESSAGE =
  "ファイル名が不正です（空・パス区切り文字・.md 以外の拡張子は使用できません）";

/**
 * 書き込み（ミューテーション）コマンド名 → 日本語操作ラベルの写像。
 * このテーブルに載っている cmd のみ失敗トースト対象（= allowlist）。
 * update_card_order は partial-move 専用文を ProjectProvider 側に残すため除外。
 * get_tasks / get_columns / get_labels / open_project は読み取り系のため除外。
 *
 * `as const satisfies` でリテラルキーを保ちつつ値型を検証する。
 * （`Readonly<Record<string,string>>` 注釈だと keyof が string に潰れる）
 */
const MUTATION_COMMAND_LABELS = {
  create_task: "タスクの作成",
  update_task: "タスクの更新",
  delete_task: "タスクの削除",
  add_link: "リンクの追加",
  remove_link: "リンクの削除",
  update_columns: "カラムの更新",
  create_milestone: "マイルストーンの作成",
  update_milestone: "マイルストーンの更新",
  delete_milestone: "マイルストーンの削除",
  create_label: "ラベルの作成",
  update_label: "ラベルの更新",
  delete_label: "ラベルの削除",
  export_labels: "ラベルのエクスポート",
} as const satisfies Record<string, string>;

/** 書き込み allowlist に含まれるコマンド名の union 型（テーブルのキーが source of truth）。 */
export type MutationCommand = keyof typeof MUTATION_COMMAND_LABELS;

/**
 * allowlist 判定用に own キーだけを 1 度だけ収めた Set。
 * 呼び出し毎の配列確保を避け、`Object.prototype` 継承キー（`toString` 等）も誤許可しない。
 */
const MUTATION_COMMAND_KEYS: ReadonlySet<string> = new Set(
  Object.keys(MUTATION_COMMAND_LABELS),
);

/**
 * cmd が書き込み allowlist に含まれるかを判定するユーザー定義型ガード。
 * true の分岐内では cmd が MutationCommand に narrowing される。
 * @param cmd Tauri コマンド名 (snake_case)
 * @returns allowlist に含まれれば true（型は `cmd is MutationCommand`）
 */
export const isMutationCommand = (cmd: string): cmd is MutationCommand =>
  MUTATION_COMMAND_KEYS.has(cmd);

/**
 * TauriError から表示用 detail を取り出す。HAS_CHILDREN / INVALID_FILE_NAME のみ専用文へ翻訳。
 * @param error 正規化済み TauriError
 * @returns toast に併記する詳細文字列
 */
const detailOf = (error: TauriError): string => {
  if (error.code === "HAS_CHILDREN") {
    return HAS_CHILDREN_MESSAGE;
  }
  if (error.code === "INVALID_FILE_NAME") {
    return INVALID_FILE_NAME_MESSAGE;
  }
  return error.message;
};

/**
 * 書き込み失敗時のトースト文言「<操作>に失敗しました: <detail>」を組み立てる。
 * cmd は MutationCommand に絞り込み済みのため、ラベル参照は全域でフォールバック不要。
 * @param cmd 書き込み allowlist コマンド名（型ガードで narrowing 済み）
 * @param error 正規化済み TauriError
 * @returns トースト本文
 */
export const buildMutationFailureMessage = (
  cmd: MutationCommand,
  error: TauriError,
): string =>
  `${MUTATION_COMMAND_LABELS[cmd]}に失敗しました: ${detailOf(error)}`;
