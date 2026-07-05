import { basenameOf } from "@/utils/path";

/** 最近開いたプロジェクト 1 件。 */
export type RecentProject = {
  /** プロジェクトの絶対パス */
  path: string;
  /** 表示名（パスの末尾セグメント） */
  name: string;
};

/** 履歴を保存する localStorage キー。 */
export const RECENT_PROJECTS_STORAGE_KEY = "spec-board:recentProjects";

/**
 * 履歴の最大保持件数。
 * 起動時の選択肢として一覧に収まり、かつ古いプロジェクトで埋もれない程度の件数として 8 件に抑える。
 */
export const MAX_RECENT_PROJECTS = 8;

/**
 * 履歴へパスを追加する。既存の同一パスは先頭へ繰り上げ、上限件数で切り詰める。
 * @param current - 現在の履歴（先頭が最新）
 * @param path - 追加するプロジェクトパス
 * @returns 追加後の履歴
 */
export const addRecentProject = (
  current: readonly RecentProject[],
  path: string,
): RecentProject[] => {
  const withoutPath = current.filter((project) => project.path !== path);
  const next: RecentProject[] = [
    { path, name: basenameOf(path) },
    ...withoutPath,
  ];
  return next.slice(0, MAX_RECENT_PROJECTS);
};

/**
 * 永続化された生値を RecentProject 配列へ正規化する。形が違う要素は無視する。
 * @param value - localStorage から読み出した任意の値
 * @returns 正規化済みの履歴配列
 */
export const normalizeRecentProjects = (value: unknown): RecentProject[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seenPaths = new Set<string>();
  const result: RecentProject[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.path !== "string" || record.path === "") {
      continue;
    }
    // 手動編集や旧バージョン由来で重複 path・上限超過が混入しうるため、
    // 復元時点でも不変条件（path 重複なし・最大 MAX 件・先頭優先）を強制する。
    if (seenPaths.has(record.path)) {
      continue;
    }
    seenPaths.add(record.path);
    const name =
      typeof record.name === "string" && record.name !== ""
        ? record.name
        : basenameOf(record.path);
    result.push({ path: record.path, name });
    if (result.length >= MAX_RECENT_PROJECTS) {
      break;
    }
  }
  return result;
};
