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
 * @param parent - Task.parent
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

  const parentLookupPath = normalizeParentPathForLookup(parent);
  if (parentLookupPath === undefined) {
    return false;
  }

  return parentLookupPath === normalizeTaskPathForLookup(filePath);
};

const normalizeParentPathForLookup = (parent: string): string | undefined => {
  if (parent === "" || parent.startsWith("/") || parent.startsWith("\\")) {
    return undefined;
  }
  if (WINDOWS_DRIVE_PREFIX_PATTERN.test(parent)) {
    return undefined;
  }

  const pathText = parent.replace(/\\/g, "/");
  const normalized = normalizePathParts(pathText, false);
  if (normalized === "") {
    return undefined;
  }

  return normalized;
};

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
