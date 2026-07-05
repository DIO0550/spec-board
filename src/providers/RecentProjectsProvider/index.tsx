import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addRecentProject,
  normalizeRecentProjects,
  RECENT_PROJECTS_STORAGE_KEY,
  type RecentProject,
} from "@/hooks/useRecentProjects/helpers";
import {
  RecentProjectsContext,
  type RecentProjectsContextValue,
} from "./context";

export type { RecentProject } from "@/hooks/useRecentProjects/helpers";
export { useRecentProjects } from "./context";

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

/** RecentProjectsProvider の Props。 */
type RecentProjectsProviderProps = {
  /** Context を供給する子要素。 */
  children: ReactNode;
};

/**
 * 最近開いたプロジェクト履歴を localStorage で管理し Context として共有する Provider。
 * Provider 配下の複数 consumer（AppSidebar / ProjectNotificationsProvider）が
 * 同一 store を参照するため、片方の `add` が他方にも即座に反映される。
 *
 * @param props - {@link RecentProjectsProviderProps}
 * @returns Provider 要素
 */
export const RecentProjectsProvider = ({
  children,
}: RecentProjectsProviderProps) => {
  const [projects, setProjects] = useState<RecentProject[]>(loadRecentProjects);
  // 初回マウントは localStorage から復元した値そのものなので、書き戻しを抑止する。
  const isHydratedRef = useRef(false);

  // updater は純粋に保ち、localStorage への永続化（副作用）は projects の
  // 変化に追従する外部システム同期として effect 側に分離する。
  const add = useCallback((path: string) => {
    setProjects((prev) => addRecentProject(prev, path));
  }, []);

  useEffect(() => {
    if (!isHydratedRef.current) {
      isHydratedRef.current = true;
      return;
    }
    try {
      localStorage.setItem(
        RECENT_PROJECTS_STORAGE_KEY,
        JSON.stringify(projects),
      );
    } catch {
      // 永続化失敗は履歴を揮発させるだけなので黙殺する
    }
  }, [projects]);

  const value = useMemo<RecentProjectsContextValue>(
    () => ({ projects, add }),
    [projects, add],
  );

  return (
    <RecentProjectsContext.Provider value={value}>
      {children}
    </RecentProjectsContext.Provider>
  );
};
