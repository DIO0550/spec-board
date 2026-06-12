import { KebabCase } from "@/domains/KebabCase";
import { normalizeTaskPathForLookup } from "@/domains/task-path";
import type { FileNameValidationError } from "@/features/task-form/lib/fields/fileName";
import { FileNameField } from "@/features/task-form/lib/fields/fileName";

/** パスプレビュー計算の入力。 */
export type SavePathPreviewInput = {
  /** タイトル現在値（fileName 未入力時の base 導出に使う） */
  title: string;
  /** ファイル名欄の生入力値 */
  fileName: string;
  /** 親タスクの filePath（未指定なら tasks/ 直下） */
  parentFilePath?: string;
  /** 既存タスクの filePath 一覧（プロジェクトルート相対） */
  existingTaskFilePaths: readonly string[];
  /** プロジェクト絶対パス（未指定なら相対パス表示にフォールバック） */
  projectPath?: string;
};

/** パスプレビューの計算結果。 */
export type SavePathPreviewResult =
  | { kind: "pending" }
  | { kind: "path"; fileName: string; relPath: string; fullPath: string }
  // FileNameField.validate の結果をそのまま保持し、文言化は fileNameErrorMessage に委ねる。
  | { kind: "invalid"; error: FileNameValidationError };

/** 親未指定時の保存先ディレクトリ。 */
const DEFAULT_TARGET_DIR = "tasks";

/**
 * 正規化済み path をディレクトリとファイル名に分解する。
 * 「最後のセグメント = ファイル名 / それ以外 = ディレクトリ」とする
 * `buildFileTree` の分解規則と同一。
 * @param normalizedPath - normalizeTaskPathForLookup 済みの path
 * @returns dir（セグメントが 1 つだけなら空文字）と file
 */
const splitDirAndFile = (
  normalizedPath: string,
): { dir: string; file: string } => {
  const lastSlash = normalizedPath.lastIndexOf("/");
  if (lastSlash === -1) {
    return { dir: "", file: normalizedPath };
  }
  return {
    dir: normalizedPath.slice(0, lastSlash),
    file: normalizedPath.slice(lastSlash + 1),
  };
};

/**
 * プロジェクト絶対パスと相対パスを表示用に結合する。
 * projectPath 末尾の `/` `\` は除去し、projectPath が `\` を含む（Windows パス）
 * 場合は relPath の `/` を `\` に変換して区切り文字を統一する。
 * @param projectPath - プロジェクト絶対パス（未指定なら relPath をそのまま返す）
 * @param relPath - プロジェクトルート相対パス（`/` 区切り）
 * @returns 表示用フルパス
 */
const joinDisplayPath = (
  projectPath: string | undefined,
  relPath: string,
): string => {
  if (projectPath === undefined) {
    return relPath;
  }
  // Windows パス判定は末尾セパレータ除去の前に行う
  //（ドライブ直下 `C:\` は除去後 `C:` になり `\` を失うため）。
  const isWindowsPath = projectPath.includes("\\");
  const trimmed = projectPath.replace(/[/\\]+$/, "");
  if (isWindowsPath) {
    return `${trimmed}\\${relPath.replace(/\//g, "\\")}`;
  }
  return `${trimmed}/${relPath}`;
};

/**
 * フォーム入力から確定ファイル名の base を導出する。
 * 明示 fileName の正規化（trim + 末尾 `.md` 剥がし）後が空なら「未指定」として
 * title の kebab-case へフォールバックする（`FileNameField.toParam` が undefined を
 * 返し BE に明示 fileName が送られない実送信経路と同値）。
 * @param title - タイトル現在値
 * @param fileName - ファイル名欄の生入力値
 * @returns base 文字列（導出不能なら空文字）
 */
const resolveBase = (title: string, fileName: string): string => {
  const explicit = FileNameField.toParam(FileNameField.fromInput(fileName));
  if (explicit !== undefined) {
    // toParam は `${base}.md` を返すため末尾拡張子を剥がして base に戻す。
    return explicit.slice(0, explicit.length - ".md".length);
  }
  return KebabCase.from(title.trim()) as string;
};

/** 保存先パスプレビューの companion object（pure function のみ）。 */
export const SavePathPreview = {
  /**
   * 衝突しないファイル名を返す（BE build_unique_filename の表示用移植）。
   * 比較は大文字小文字を区別し、base 内の記号・末尾数字は解釈しない。
   * 連番は `-1, -2, ...` を順に試し最初の空きを使う。
   * @param base - 拡張子を除いたファイル名（非空前提）
   * @param existing - 同ディレクトリ直下の既存ファイル名集合
   * @returns `{base}.md` または `{base}-N.md`
   */
  buildUniqueFileName: (
    base: string,
    existing: ReadonlySet<string>,
  ): string => {
    const candidate = `${base}.md`;
    if (!existing.has(candidate)) {
      return candidate;
    }
    for (let n = 1; ; n++) {
      const numbered = `${base}-${n}.md`;
      if (!existing.has(numbered)) {
        return numbered;
      }
    }
  },

  /**
   * フォーム現在値から保存先パスプレビューを計算する。
   * @param input - {@link SavePathPreviewInput}
   * @returns pending（base 導出不能）/ path（表示パス）/ invalid（警告）
   */
  compute: (input: SavePathPreviewInput): SavePathPreviewResult => {
    // OS 予約文字の検出は submit 時の fileName 欄エラーと同じソース
    //（FileNameField.validate）を使い、error をそのまま保持する。
    const validation = FileNameField.validate(
      FileNameField.fromInput(input.fileName),
    );
    if (!validation.ok) {
      return { kind: "invalid", error: validation.error };
    }

    const base = resolveBase(input.title, input.fileName);
    if (base === "") {
      return { kind: "pending" };
    }

    const targetDir =
      input.parentFilePath === undefined
        ? DEFAULT_TARGET_DIR
        : splitDirAndFile(normalizeTaskPathForLookup(input.parentFilePath)).dir;

    // 既存ファイル名集合は targetDir 直下のタスクのみ（filePath 側にも同じ正規化を適用）。
    const existing = new Set<string>();
    for (const filePath of input.existingTaskFilePaths) {
      const { dir, file } = splitDirAndFile(
        normalizeTaskPathForLookup(filePath),
      );
      if (dir === targetDir) {
        existing.add(file);
      }
    }

    const fileName = SavePathPreview.buildUniqueFileName(base, existing);
    const relPath = targetDir === "" ? fileName : `${targetDir}/${fileName}`;
    return {
      kind: "path",
      fileName,
      relPath,
      fullPath: joinDisplayPath(input.projectPath, relPath),
    };
  },
};
