import { createContext, useContext } from "react";
import type { RecentProject } from "@/hooks/useRecentProjects/helpers";

/** RecentProjectsProvider が公開する値。既存 `UseRecentProjectsResult` と厳密に一致。 */
export type RecentProjectsContextValue = {
  /** 最近開いたプロジェクト一覧（先頭が最新） */
  projects: RecentProject[];
  /**
   * プロジェクトを履歴へ追加する。
   * @param path - 追加するプロジェクトパス
   */
  add: (path: string) => void;
};

// Provider 未提供時を null で表現し、フック側で early throw する規約に揃える。
export const RecentProjectsContext =
  createContext<RecentProjectsContextValue | null>(null);

/**
 * 最近開いたプロジェクト履歴を取得するフック。
 * @throws RecentProjectsProvider の外で呼ばれた場合
 * @returns 履歴一覧と追加ハンドラ
 */
export const useRecentProjects = (): RecentProjectsContextValue => {
  const context = useContext(RecentProjectsContext);
  if (context === null) {
    throw new Error(
      "useRecentProjects は RecentProjectsProvider の内側で使用してください",
    );
  }
  return context;
};
