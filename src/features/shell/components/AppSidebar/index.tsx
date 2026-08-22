import { useState } from "react";
import type { RecentProject } from "@/providers/RecentProjectsProvider";
import type { Task } from "@/types/task";
import { useSidebar } from "../../hooks/useSidebar";
import { FileTree } from "../FileTree";
import { ProjectSwitcher } from "../ProjectSwitcher";

type AppSidebarProps = {
  /** 現在開いているプロジェクト名。 */
  projectName?: string;
  /** 現在開いているプロジェクトのパス。 */
  currentPath?: string;
  /** 最近開いたプロジェクト一覧。 */
  recentProjects: readonly RecentProject[];
  /** ファイルツリーに表示するタスク一覧。 */
  tasks: Task[];
  /** 選択中タスク ID。 */
  selectedTaskId?: string | null;
  /** 外部管理時の折りたたみ状態。 */
  collapsed?: boolean;
  /** 外部管理時の開閉ハンドラ。 */
  onToggle?: () => void;
  /** ディレクトリダイアログを開くハンドラ。 */
  onOpenProject: () => void;
  /**
   * 指定パスのプロジェクトを開くハンドラ。
   * @param path - 開くプロジェクトの絶対パス
   */
  onOpenProjectPath: (path: string) => void;
  /**
   * ファイル選択ハンドラ。
   * @param taskId - 選択されたタスク ID
   */
  onSelectTask: (taskId: string) => void;
};

/** @returns ワークスペース見出しのアイコン */
const WorkspaceIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]">
    <path d="M3 7l9-4 9 4-9 4-9-4z" />
    <path d="M3 12l9 4 9-4M3 17l9 4 9-4" />
  </svg>
);

/** @returns サイドバーを畳むボタンのアイコン */
const CollapseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[15px]">
    <path d="M15 6l-6 6 6 6" />
  </svg>
);

/** @returns グループの開閉を示すシェブロンアイコン */
const GroupChevronIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

/**
 * 全高248px幅のproject explorer。controlled / uncontrolled双方で折りたためる。
 * @param props - {@link AppSidebarProps}
 * @returns sidebar。折りたたみ時はrailを残さずnull
 */
export const AppSidebar = ({
  projectName,
  currentPath,
  recentProjects,
  tasks,
  selectedTaskId,
  collapsed,
  onToggle,
  onOpenProject,
  onOpenProjectPath,
  onSelectTask,
}: AppSidebarProps) => {
  const internalSidebar = useSidebar();
  const isCollapsed = collapsed ?? internalSidebar.collapsed;
  const handleToggle = onToggle ?? internalSidebar.toggle;
  const [groupCollapsed, setGroupCollapsed] = useState(false);

  const projectPaths = new Set(recentProjects.map((project) => project.path));
  if (currentPath !== undefined) {
    projectPaths.add(currentPath);
  }
  const projectCount = projectPaths.size;
  const groupName = (projectName ?? "プロジェクト未選択").toUpperCase();

  if (isCollapsed) {
    return null;
  }

  return (
    <aside className="spec-sidebar group/sidebar flex h-full w-[248px] shrink-0 flex-col overflow-hidden border-r border-border bg-panel-2">
      <div className="spec-sidebar-workspace">
        <span className="spec-sidebar-workspace-icon spec-stroke-icon">
          <WorkspaceIcon />
        </span>
        <span className="spec-sidebar-workspace-name">spec-board</span>
        <span className="spec-sidebar-workspace-meta">
          {projectCount} {projectCount === 1 ? "project" : "projects"}
        </span>
        <button
          type="button"
          onClick={handleToggle}
          aria-label="サイドバーを閉じる"
          aria-expanded={true}
          className="spec-sidebar-collapse spec-icon-button opacity-0 group-hover/sidebar:opacity-100 focus-visible:opacity-100"
        >
          <CollapseIcon />
        </button>
      </div>
      <div className="spec-sidebar-divider" />
      <ProjectSwitcher
        projectName={projectName}
        currentPath={currentPath}
        recentProjects={recentProjects}
        onOpenProject={onOpenProject}
        onOpenProjectPath={onOpenProjectPath}
      />
      <section
        className={[
          "spec-sidebar-group",
          groupCollapsed ? "is-collapsed" : "is-expanded",
        ].join(" ")}
      >
        <div className="spec-sidebar-group-header">
          <button
            type="button"
            onClick={() => setGroupCollapsed((previous) => !previous)}
            aria-expanded={!groupCollapsed}
            className="spec-sidebar-group-toggle"
          >
            <span
              aria-hidden="true"
              className={[
                "spec-sidebar-group-twisty",
                groupCollapsed ? "is-collapsed" : "is-expanded",
              ].join(" ")}
            >
              <GroupChevronIcon />
            </span>
            <span className="spec-sidebar-group-name">{groupName}</span>
          </button>
        </div>
        {!groupCollapsed && (
          <div className="spec-sidebar-group-body">
            <FileTree
              tasks={tasks}
              selectedTaskId={selectedTaskId}
              onSelectTask={onSelectTask}
            />
          </div>
        )}
      </section>
    </aside>
  );
};
