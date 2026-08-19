import { useArchivedTasks } from "@/features/settings/hooks/useArchivedTasks";
import { useToastDispatch } from "@/providers/ToastProvider";

/**
 * アーカイブ済みタスクの一覧表示と復元を提供する設定タブ。
 * 一覧の取得・復元 IPC はタブ内の {@link useArchivedTasks} に閉じる。
 * 復元後のボード反映は watcher 経由のため、ここではボード state を触らない。
 * @returns アーカイブ設定タブ要素
 */
export const ArchiveSettingsTab = () => {
  const { state, reload, restore } = useArchivedTasks();
  const { showToast } = useToastDispatch();

  /**
   * 1 件復元してトースト通知する。
   * @param filePath - アーカイブ内相対パス
   */
  const handleRestore = async (filePath: string): Promise<void> => {
    const restored = await restore(filePath);
    if (restored) {
      showToast("タスクを復元しました", "success");
    }
  };

  return (
    <section
      className="mx-auto flex w-full max-w-[1080px] flex-col gap-4"
      aria-labelledby="archive-settings-title"
    >
      <header className="flex flex-wrap items-end gap-4">
        <h1
          id="archive-settings-title"
          className="m-0 text-[22px] font-semibold"
        >
          アーカイブ
        </h1>
        {state.kind === "loaded" && (
          <p className="pb-1 text-xs text-muted">
            <strong className="font-mono text-foreground">
              {state.tasks.length}
            </strong>{" "}
            件
          </p>
        )}
        <button
          type="button"
          onClick={reload}
          className="ml-auto h-7 rounded-md border border-border bg-surface-muted px-2.5 text-xs font-medium"
        >
          再読み込み
        </button>
      </header>
      <p className="m-0 max-w-[68ch] text-[12.5px] text-muted">
        アーカイブしたタスクは <code>.spec-board/archive/</code>{" "}
        に保存され、ボードと走査の対象から外れます。復元すると元の場所へ戻ります（同名ファイルがある場合は連番が付きます）。
      </p>
      {state.kind === "loading" && (
        <p className="text-sm text-muted">読み込み中…</p>
      )}
      {state.kind === "error" && (
        <div
          role="alert"
          className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-xs text-danger"
        >
          アーカイブ一覧を取得できませんでした。
        </div>
      )}
      {state.kind === "loaded" && state.tasks.length === 0 && (
        <p className="rounded-md border border-border bg-surface px-3.5 py-6 text-center text-sm text-muted">
          アーカイブされたタスクはありません
        </p>
      )}
      {state.kind === "loaded" && state.tasks.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="grid grid-cols-[minmax(200px,1fr)_120px_minmax(200px,1fr)_88px] items-center gap-3 border-b border-border bg-surface-muted px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
            <span>タイトル</span> <span>ステータス</span> <span>元のパス</span>{" "}
            <span className="sr-only">操作</span>
          </div>
          {state.tasks.map((task) => (
            <div
              key={task.filePath}
              className="grid grid-cols-[minmax(200px,1fr)_120px_minmax(200px,1fr)_88px] items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0 hover:bg-surface-muted"
            >
              <span className="truncate text-[12.5px] font-medium">
                {task.title}
              </span>
              <span className="truncate font-mono text-xs text-muted">
                {task.status ?? "—"}
              </span>
              <span className="truncate font-mono text-[11px] text-text-dim">
                {task.filePath}
              </span>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleRestore(task.filePath)}
                  aria-label={`${task.title} を復元`}
                  className="h-7 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-background"
                >
                  復元
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
