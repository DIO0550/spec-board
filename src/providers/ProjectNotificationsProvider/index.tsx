import { type ReactNode, useEffect } from "react";
import {
  buildTasksByNormalizedPath,
  countTasksWithBrokenLink,
} from "@/domains/broken-link";
import { countTasksWithParseError } from "@/domains/parse-error";
import {
  type ProjectEvent,
  projectErrorMessage,
  useProjectEvents,
  wasNotifiedByInvokeWrapped,
} from "@/providers/ProjectProvider";
import { useRecentProjects } from "@/providers/RecentProjectsProvider";
import { useToastDispatch } from "@/providers/ToastProvider";
import { watcherDiagnosticMessage } from "./watcherDiagnosticMessage";

/** ProjectNotificationsProvider の Props。 */
type ProjectNotificationsProviderProps = {
  /** そのまま描画する子要素。この Provider は Context を提供しない。 */
  children: ReactNode;
};

/**
 * ProjectProvider が公開するドメインイベント（`useProjectEvents().subscribe`）を購読し、
 * open の帰結に対する通知副作用（最近一覧への追加 / リンク切れ・パースエラーの警告トースト /
 * open 失敗の error トースト）を発火する副作用専用 Provider。Context は提供せず children を
 * そのまま返す。ProjectProvider / ToastProvider / RecentProjectsProvider すべての内側に
 * 置く必要がある（3 つの Context に依存するため）。
 *
 * @param props - {@link ProjectNotificationsProviderProps}
 * @returns children をそのまま返す要素
 */
export const ProjectNotificationsProvider = ({
  children,
}: ProjectNotificationsProviderProps) => {
  const { subscribe } = useProjectEvents();
  const { showToast } = useToastDispatch();
  const { add: addRecentProject } = useRecentProjects();

  useEffect(() => {
    const handleEvent = (event: ProjectEvent): void => {
      if (event.type === "loaded") {
        addRecentProject(event.path);
        // リンク切れ / パースエラーは判定ドメイン・文言が別なので個別に集計して通知する。
        const brokenLinkCount = countTasksWithBrokenLink(
          event.data.tasks,
          buildTasksByNormalizedPath(event.data.tasks),
        );
        if (brokenLinkCount >= 1) {
          showToast(`リンク切れが ${brokenLinkCount} 件あります`, "warning");
        }
        const parseErrorCount = countTasksWithParseError(event.data.tasks);
        if (parseErrorCount >= 1) {
          showToast(`パースエラーが ${parseErrorCount} 件あります`, "warning");
        }
        return;
      }
      if (event.type === "watcher-diagnostic") {
        // 監視が壊れても board は静かに古くなるだけなので、必ず可視化する。
        showToast(watcherDiagnosticMessage(event.code), "error");
        return;
      }
      // invokeWrapped が既に通知済み（allowlist 由来 tauri）なら二重通知を避ける。
      if (wasNotifiedByInvokeWrapped(event.error)) {
        return;
      }
      showToast(projectErrorMessage(event.error), "error");
    };
    return subscribe(handleEvent);
  }, [subscribe, addRecentProject, showToast]);

  return <>{children}</>;
};
