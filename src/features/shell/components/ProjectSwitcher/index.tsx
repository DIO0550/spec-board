import type { RecentProject } from "@/providers/RecentProjectsProvider";

/** ProjectSwitcher の Props。 */
type ProjectSwitcherProps = {
  /** 現在開いているプロジェクト名（未オープン時は undefined） */
  projectName?: string;
  /** 現在開いているプロジェクトのパス（最近一覧から除外するため） */
  currentPath?: string;
  /** 最近開いたプロジェクト一覧（先頭が最新） */
  recentProjects: readonly RecentProject[];
  /** ディレクトリダイアログを開くハンドラ。 */
  onOpenProject: () => void;
  /**
   * 指定パスのプロジェクトを開くハンドラ。
   * @param path - 開くプロジェクトの絶対パス
   */
  onOpenProjectPath: (path: string) => void;
};

/**
 * 現在のプロジェクト表示・新規オープン・最近開いたプロジェクトへの切替を担う。
 * @param props - {@link ProjectSwitcherProps}
 * @returns プロジェクトスイッチャー要素
 */
export const ProjectSwitcher = ({
  projectName,
  currentPath,
  recentProjects,
  onOpenProject,
  onOpenProjectPath,
}: ProjectSwitcherProps) => {
  const others = recentProjects.filter(
    (project) => project.path !== currentPath,
  );

  return (
    <div className="flex flex-col gap-2 border-b border-border p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-foreground">
          {projectName ?? "プロジェクト未選択"}
        </span>
        <button
          type="button"
          onClick={onOpenProject}
          className="shrink-0 rounded border border-border px-2 py-0.5 text-xs text-muted hover:bg-surface-muted"
        >
          開く
        </button>
      </div>

      {others.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="px-1 text-xs text-muted">最近開いた</span>
          <ul className="flex flex-col">
            {others.map((project) => (
              <li key={project.path}>
                <button
                  type="button"
                  onClick={() => onOpenProjectPath(project.path)}
                  title={project.path}
                  className="w-full truncate rounded px-1 py-0.5 text-left text-xs text-foreground hover:bg-surface-muted"
                >
                  {project.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
