import { save } from "@tauri-apps/plugin-dialog";
import { TauriError } from "@/lib/tauri/tauriError";
import { Result, type Result as ResultT } from "@/utils/result";

/** save() に渡すフィルタ条件（拡張子による絞り込み）。 */
export type SaveFileDialogFilter = {
  /** filter の表示名 */
  name: string;
  /** 受理する拡張子の配列（ドット無し） */
  extensions: string[];
};

/**
 * saveFileDialog の呼び出しオプション。
 * `@tauri-apps/plugin-dialog` の `save()` にそのまま透過するため、
 * 値の解釈は plugin の挙動に従う。
 */
export type SaveFileDialogOptions = {
  /**
   * ダイアログ初期表示の既定ファイル名 or パス。
   * 相対のファイル名（例: `"labels.yml"`）を渡すと OS の「最後に使った保存先」を
   * ベースに表示される。絶対パスを渡すとそのディレクトリ/ファイル名がプリセットされる。
   */
  defaultPath?: string;
  /** ファイルタイプフィルタ（拡張子による絞り込み）。 */
  filters?: SaveFileDialogFilter[];
};

/**
 * OS のファイル保存 dialog を開いて保存先パスを取得する。
 * - 選択された: Result.ok(path)
 * - キャンセル: Result.ok(null)
 * - dialog plugin 例外: Result.err(TauriError)
 *
 * 書き込み自体は行わず、選択結果のみを返す。実書き込みは後段（BE `export_labels` 等）に委ねる。
 * @param opts - 既定パス・拡張子フィルタなどのオプション
 * @returns 成否を表す Result
 */
export const saveFileDialog = async (
  opts: SaveFileDialogOptions = {},
): Promise<ResultT<string | null, TauriError>> => {
  try {
    const selected = await save({
      defaultPath: opts.defaultPath,
      filters: opts.filters,
    });
    return Result.ok(typeof selected === "string" ? selected : null);
  } catch (e) {
    return Result.err(TauriError.from(e));
  }
};
