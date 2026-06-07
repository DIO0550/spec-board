import { useCallback, useState } from "react";

/** 最近開いたプロジェクト 1 件。 */
export type RecentProject = {
  /** プロジェクトの絶対パス */
  path: string;
  /** 表示名（パスの末尾セグメント） */
  name: string;
};

/** 履歴を保存する localStorage キー。 */
export const RECENT_PROJECTS_STORAGE_KEY = "spec-board:recentProjects";

/** 履歴の最大保持件数。 */
const MAX_RECENT_PROJECTS = 8;

/**
 * パスの末尾セグメント（フォルダ名）を取り出す。区切りは `/` と `\` の両方を許容する。
 * @param path - プロジェクトの絶対パス
 * @returns 末尾セグメント。取り出せなければパス全体
 */
export const basenameOf = (path: string): string => {
  const segments = path.split(/[\\/]+/).filter((segment) => segment !== "");
  return segments[segments.length - 1] ?? path;
};

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
  const result: RecentProject[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.path !== "string" || record.path === "") {
      continue;
    }
    const name =
      typeof record.name === "string" && record.name !== ""
        ? record.name
        : basenameOf(record.path);
    result.push({ path: record.path, name });
  }
  return result;
};

/**
 * localStorage から履歴を読み込む（壊れた値・アクセス不可は空配列）。
 * @returns 復元した履歴配列
 */
const loadRecentProjects = (): RecentProject[] => {
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_STORAGE_KEY);
    if (raw === null) {
      return [];
    }
    return normalizeRecentProjects(JSON.parse(raw));
  } catch {
    return [];
  }
};

/** useRecentProjects の返り値。 */
export type UseRecentProjectsResult = {
  /** 最近開いたプロジェクト一覧（先頭が最新） */
  projects: RecentProject[];
  /**
   * プロジェクトを履歴へ追加する。
   * @param path - 追加するプロジェクトパス
   */
  add: (path: string) => void;
};

/**
 * 最近開いたプロジェクトの履歴を localStorage で管理する共有フック。
 * @returns 履歴一覧と追加ハンドラ
 */
export const useRecentProjects = (): UseRecentProjectsResult => {
  const [projects, setProjects] = useState<RecentProject[]>(loadRecentProjects);

  const add = useCallback((path: string) => {
    setProjects((prev) => {
      const next = addRecentProject(prev, path);
      try {
        localStorage.setItem(RECENT_PROJECTS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // 永続化失敗は履歴を揮発させるだけなので黙殺する
      }
      return next;
    });
  }, []);

  return { projects, add };
};
