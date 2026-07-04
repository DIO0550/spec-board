import type { RecentProject } from "@/providers/RecentProjectsProvider";
import type { Task } from "@/types/task";
import { useSidebar } from "../../hooks/useSidebar";
import { FileTree } from "../FileTree";
import { ProjectSwitcher } from "../ProjectSwitcher";

/** AppSidebar の Props。 */
type AppSidebarProps = {
  /** 現在開いているプロジェクト名 */
  projectName?: string;
  /** 現在開いているプロジェクトのパス */
  currentPath?: string;
  /** 最近開いたプロジェクト一覧 */
  recentProjects: readonly RecentProject[];
  /** ファイルツリーに表示するタスク一覧 */
  tasks: Task[];
  /** 選択中タスク ID（ハイライト用） */
  selectedTaskId?: string | null;
  /** ディレクトリダイアログを開くハンドラ。 */
  onOpenProject: () => void;
  /**
   * 指定パスのプロジェクトを開くハンドラ。
   * @param path - 開くプロジェクトの絶対パス
   */
  onOpenProjectPath: (path: string) => void;
  /**
   * ファイル（タスク）選択時のコールバック。
   * @param taskId - 選択されたタスクの ID
   */
  onSelectTask: (taskId: string) => void;
};

/**
 * 左サイドバー（プロジェクトスイッチャー + タスクファイルツリー）。折りたたみできる。
 * 折りたたみ状態は useSidebar で localStorage に永続化する。
 * @param props - {@link AppSidebarProps}
 * @returns サイドバー要素
 */
export const AppSidebar = ({
  projectName,
  currentPath,
  recentProjects,
  tasks,
  selectedTaskId,
  onOpenProject,
  onOpenProjectPath,
  onSelectTask,
}: AppSidebarProps) => {
  const { collapsed, toggle } = useSidebar();

  if (collapsed) {
    return (
      <aside className="flex w-8 shrink-0 flex-col items-center border-r border-border bg-surface py-2">
        <button
          type="button"
          onClick={toggle}
          aria-label="サイドバーを開く"
          aria-expanded={false}
          className="rounded px-1 py-1 text-sm text-muted hover:bg-surface-muted"
        >
          »
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col overflow-hidden border-r border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-2 py-1">
        <span className="text-xs font-semibold text-muted">
          エクスプローラー
        </span>
        <button
          type="button"
          onClick={toggle}
          aria-label="サイドバーを閉じる"
          aria-expanded={true}
          className="rounded px-1 text-sm text-muted hover:bg-surface-muted"
        >
          «
        </button>
      </div>
      <ProjectSwitcher
        projectName={projectName}
        currentPath={currentPath}
        recentProjects={recentProjects}
        onOpenProject={onOpenProject}
        onOpenProjectPath={onOpenProjectPath}
      />
      <div className="min-h-0 flex-1 overflow-auto py-1">
        <FileTree
          tasks={tasks}
          selectedTaskId={selectedTaskId}
          onSelectTask={onSelectTask}
        />
      </div>
    </aside>
  );
};
