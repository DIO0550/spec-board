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

const WorkspaceIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]">
    <path d="M3 7l9-4 9 4-9 4-9-4z" />
    <path d="M3 12l9 4 9-4M3 17l9 4 9-4" />
  </svg>
);

const CollapseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[15px]">
    <path d="M15 6l-6 6 6 6" />
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

  if (isCollapsed) {
    return null;
  }

  return (
    <aside className="group/sidebar flex h-full w-[248px] shrink-0 flex-col overflow-hidden border-r border-border bg-panel-2">
      <div className="flex shrink-0 items-center gap-2 px-3.5 pt-2.5 pb-2">
        <span className="shrink-0 text-muted spec-stroke-icon">
          <WorkspaceIcon />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-[-0.01em] text-foreground">
          spec-board
        </span>
        <button
          type="button"
          onClick={handleToggle}
          aria-label="サイドバーを閉じる"
          aria-expanded={true}
          className="spec-icon-button opacity-0 group-hover/sidebar:opacity-100 focus-visible:opacity-100"
        >
          <CollapseIcon />
        </button>
      </div>
      <div className="mx-3 h-px shrink-0 bg-border" />
      <ProjectSwitcher
        projectName={projectName}
        currentPath={currentPath}
        recentProjects={recentProjects}
        onOpenProject={onOpenProject}
        onOpenProjectPath={onOpenProjectPath}
      />
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-6 shrink-0 items-center gap-1 px-2 text-[11px] font-bold tracking-[0.04em] text-foreground uppercase">
          <span aria-hidden="true" className="text-muted">
            ▾
          </span>
          <span className="min-w-0 flex-1 truncate">
            {projectName ?? "プロジェクト未選択"}
          </span>
          <span className="font-mono text-[10px] font-medium text-text-dim">
            {tasks.length}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <FileTree
            tasks={tasks}
            selectedTaskId={selectedTaskId}
            onSelectTask={onSelectTask}
          />
        </div>
      </section>
    </aside>
  );
};
