const WINDOWS_DRIVE_PREFIX_PATTERN = /^[A-Za-z]:/;

/**
 * Task の公開 filePath を lookup 用に正規化する。
 * @param path - Task.filePath
 * @returns lookup 用 path
 */
export const normalizeTaskPathForLookup = (path: string): string => {
  const pathText = path.replace(/\\/g, "/");
  return normalizePathParts(pathText, true);
};

/**
 * parent 参照が Task.filePath を指しているかを判定する。
 * @param parent - Task.hierarchy.parentFilePath
 * @param filePath - 比較対象の Task.filePath
 * @returns parent が filePath を指す場合 true
 */
export const parentReferencesTaskPath = (
  parent: string | undefined,
  filePath: string,
): boolean => {
  if (parent === undefined) {
    return false;
  }
  if (parent === filePath) {
    return true;
  }

  const parentLookupPath = normalizeRefPathForLookup(parent);
  if (parentLookupPath === undefined) {
    return false;
  }

  return parentLookupPath === normalizeTaskPathForLookup(filePath);
};

/**
 * link 参照（`linkedFilePaths` / `reverseLinkedFilePaths` の要素）が Task.filePath を
 * 指しているかを判定する。frontmatter 由来の link は verbatim 保持されるため、
 * `./tasks/b.md` / `tasks\\b.md` などの表記揺れを normalize 経由で吸収する。
 * @param link Task.links.linkedFilePaths / reverseLinkedFilePaths の要素
 * @param filePath - 比較対象の Task.filePath
 * @returns link が filePath を指す場合 true
 */
export const linkReferencesTaskPath = (
  link: string,
  filePath: string,
): boolean => {
  if (link === filePath) {
    return true;
  }
  const linkLookupPath = normalizeRefPathForLookup(link);
  if (linkLookupPath === undefined) {
    return false;
  }
  return linkLookupPath === normalizeTaskPathForLookup(filePath);
};

/**
 * 参照 path（parent / links / children / reverseLinks 要素）を lookup 用に正規化する。
 * 空文字 / 絶対 path / Windows drive prefix は「参照対象外」として undefined を返す。
 * @param ref 参照 path 文字列
 * @returns 正規化済み path、対象外なら undefined
 */
export const normalizeRefPathForLookup = (ref: string): string | undefined => {
  if (ref === "" || ref.startsWith("/") || ref.startsWith("\\")) {
    return undefined;
  }
  if (WINDOWS_DRIVE_PREFIX_PATTERN.test(ref)) {
    return undefined;
  }

  const pathText = ref.replace(/\\/g, "/");
  const normalized = normalizePathParts(pathText, false);
  if (normalized === "") {
    return undefined;
  }

  return normalized;
};

/**
 * `/` 区切り path を正規化する。空セグメント / `.` を除去し、必要に応じて drive prefix セグメントも落とす。
 * @param pathText `/` 区切りに揃えた path 文字列
 * @param removeDrivePrefix `:` で終わるセグメント（drive prefix）も除去するか
 * @returns 正規化済み path
 */
const normalizePathParts = (
  pathText: string,
  removeDrivePrefix: boolean,
): string => {
  const parts = pathText
    .split("/")
    .filter((part) => part !== "" && part !== ".")
    .filter((part) => !(removeDrivePrefix && part.endsWith(":")));
  return parts.join("/");
};
