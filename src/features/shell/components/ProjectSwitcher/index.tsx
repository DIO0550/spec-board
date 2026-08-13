import { useState } from "react";
import type { RecentProject } from "@/providers/RecentProjectsProvider";

type ProjectSwitcherProps = {
  /** 現在開いているプロジェクト名。 */
  projectName?: string;
  /** 現在開いているプロジェクトのパス。 */
  currentPath?: string;
  /** 最近開いたプロジェクト一覧。 */
  recentProjects: readonly RecentProject[];
  /** ディレクトリダイアログを開くハンドラ。 */
  onOpenProject: () => void;
  /**
   * 指定パスを開くハンドラ。
   * @param path - project path
   */
  onOpenProjectPath: (path: string) => void;
};

/**
 * project名から2文字のmarkを生成する。
 * @param name - project名
 * @returns 大文字2文字
 */
const projectMark = (name: string): string => {
  const segments = name.split(/[-_]/u).filter(Boolean);
  const first = segments[0] ?? "";
  const secondCharacter = segments[1]?.[0] ?? first[1] ?? "";
  return `${first[0] ?? ""}${secondCharacter}`.toUpperCase();
};

/**
 * 現在projectとrecent projectsを切り替えるpopover。
 * @param props - {@link ProjectSwitcherProps}
 * @returns project switcher
 */
export const ProjectSwitcher = ({
  projectName,
  currentPath,
  recentProjects,
  onOpenProject,
  onOpenProjectPath,
}: ProjectSwitcherProps) => {
  const [open, setOpen] = useState(false);
  const name = projectName ?? "プロジェクトを開く";
  const others = recentProjects.filter(
    (project) => project.path !== currentPath,
  );

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={currentPath}
        className="mx-2 mt-1 mb-1.5 flex w-[calc(100%-1rem)] items-center gap-1.5 rounded-[5px] border border-border bg-surface px-2 py-1.5 text-xs hover:border-border-strong"
      >
        <span className="flex size-4 shrink-0 items-center justify-center rounded bg-accent font-mono text-[9px] font-bold text-accent-foreground">
          {projectMark(name)}
        </span>
        <span className="min-w-0 flex-1 truncate text-left font-semibold">
          {name}
        </span>
        <span aria-hidden="true" className="text-text-dim">
          ⌄
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full left-2 z-60 w-80 overflow-hidden rounded-lg border border-border-strong bg-surface shadow-lg"
        >
          {currentPath && (
            <div className="p-1">
              <p className="px-2 pt-1.5 pb-1 text-[10px] font-semibold tracking-[0.06em] text-text-dim uppercase">
                現在のプロジェクト
              </p>
              <div className="rounded-[5px] bg-accent-soft px-2 py-1.5 text-xs">
                <span className="font-medium">{projectName}</span>
                <span className="ml-2 font-mono text-[10.5px] text-text-dim">
                  {currentPath}
                </span>
              </div>
            </div>
          )}
          {others.length > 0 && (
            <div className="border-t border-border p-1">
              <p className="px-2 pt-1.5 pb-1 text-[10px] font-semibold tracking-[0.06em] text-text-dim uppercase">
                最近開いたプロジェクト
              </p>
              {others.map((project) => (
                <button
                  key={project.path}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onOpenProjectPath(project.path);
                  }}
                  className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-xs hover:bg-bg"
                >
                  <span className="font-medium">{project.name}</span>
                  <span className="ml-auto max-w-40 truncate font-mono text-[10.5px] text-text-dim">
                    {project.path}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="border-t border-border p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenProject();
              }}
              className="w-full rounded-[5px] px-2 py-1.5 text-left text-xs text-muted hover:bg-bg hover:text-foreground"
            >
              ＋ プロジェクトを開く…
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
