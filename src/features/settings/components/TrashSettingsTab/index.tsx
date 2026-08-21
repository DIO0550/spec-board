import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useTrashedTasks } from "@/features/settings/hooks/useTrashedTasks";
import { useToastDispatch } from "@/providers/ToastProvider";

/** 確認ダイアログを要する破壊的操作（完全削除 / 全消去）の保留状態。 */
type PendingDestructiveAction =
  | { kind: "purge"; filePath: string; title: string }
  | { kind: "empty" };

/**
 * ゴミ箱（削除済みタスク）の一覧・復元・完全削除を提供する設定タブ。
 * 一覧・操作の IPC はタブ内の {@link useTrashedTasks} に閉じる。
 * 復元後のボード反映は watcher 経由のため、ここではボード state を触らない。
 * 完全削除・全消去は復元不可のため確認ダイアログを挟む。
 * @returns ゴミ箱設定タブ要素
 */
export const TrashSettingsTab = () => {
  const { state, reload, restore, purge, empty } = useTrashedTasks();
  const { showToast } = useToastDispatch();
  const [pendingAction, setPendingAction] =
    useState<PendingDestructiveAction | null>(null);

  /**
   * 1 件復元してトースト通知する。
   * @param filePath - ゴミ箱内相対パス
   */
  const handleRestore = async (filePath: string): Promise<void> => {
    const restored = await restore(filePath);
    if (restored) {
      showToast("タスクを復元しました", "success");
    }
  };

  /** 保留中の破壊的操作を実行する。 */
  const handleConfirmDestructive = async (): Promise<void> => {
    if (pendingAction === null) {
      return;
    }
    const action = pendingAction;
    setPendingAction(null);
    if (action.kind === "purge") {
      const purged = await purge(action.filePath);
      if (purged) {
        showToast("タスクを完全に削除しました", "success");
      }
      return;
    }
    const emptied = await empty();
    if (emptied) {
      showToast("ゴミ箱を空にしました", "success");
    }
  };

  return (
    <section
      className="mx-auto flex w-full max-w-[1080px] flex-col gap-4"
      aria-labelledby="trash-settings-title"
    >
      <header className="flex flex-wrap items-end gap-4">
        <h1 id="trash-settings-title" className="m-0 text-[22px] font-semibold">
          ゴミ箱
        </h1>
        {state.kind === "loaded" && (
          <p className="pb-1 text-xs text-muted">
            <strong className="font-mono text-foreground">
              {state.tasks.length}
            </strong>{" "}
            件
          </p>
        )}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={reload}
            className="h-7 rounded-md border border-border bg-surface-muted px-2.5 text-xs font-medium"
          >
            再読み込み
          </button>
          <button
            type="button"
            disabled={state.kind !== "loaded" || state.tasks.length === 0}
            onClick={() => setPendingAction({ kind: "empty" })}
            className="h-7 rounded-md border border-red-300 px-2.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            ゴミ箱を空にする
          </button>
        </div>
      </header>
      <p className="m-0 max-w-[68ch] text-[12.5px] text-muted">
        削除したタスクは <code>.spec-board/trash/</code>{" "}
        に移動され、ここから復元できます。復元すると元の場所へ戻ります（同名ファイルがある場合は連番が付きます）。完全削除・ゴミ箱を空にする操作は取り消せません。
      </p>
      {state.kind === "loading" && (
        <p className="text-sm text-muted">読み込み中…</p>
      )}
      {state.kind === "error" && (
        <div
          role="alert"
          className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-xs text-danger"
        >
          ゴミ箱一覧を取得できませんでした。
        </div>
      )}
      {state.kind === "loaded" && state.tasks.length === 0 && (
        <p className="rounded-md border border-border bg-surface px-3.5 py-6 text-center text-sm text-muted">
          ゴミ箱は空です
        </p>
      )}
      {state.kind === "loaded" && state.tasks.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="grid grid-cols-[minmax(180px,1fr)_100px_minmax(180px,1fr)_150px_150px] items-center gap-3 border-b border-border bg-surface-muted px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
            <span>タイトル</span> <span>ステータス</span> <span>元のパス</span>{" "}
            <span>削除日時</span> <span className="sr-only">操作</span>
          </div>
          {state.tasks.map((task) => (
            <div
              key={task.filePath}
              className="grid grid-cols-[minmax(180px,1fr)_100px_minmax(180px,1fr)_150px_150px] items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0 hover:bg-surface-muted"
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
              <span className="truncate font-mono text-[11px] text-text-dim">
                {task.deletedAt ?? "—"}
              </span>
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleRestore(task.filePath)}
                  aria-label={`${task.title} を復元`}
                  className="h-7 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-background"
                >
                  復元
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPendingAction({
                      kind: "purge",
                      filePath: task.filePath,
                      title: task.title,
                    })
                  }
                  aria-label={`${task.title} を完全に削除`}
                  className="h-7 rounded-md border border-red-300 px-2.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  完全削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {pendingAction !== null && (
        <ConfirmDialog
          title={
            pendingAction.kind === "purge"
              ? "タスクを完全に削除しますか？"
              : "ゴミ箱を空にしますか？"
          }
          message={
            pendingAction.kind === "purge"
              ? `「${pendingAction.title}」をゴミ箱から完全に削除します。この操作は取り消せません。`
              : "ゴミ箱内のすべてのタスクを完全に削除します。この操作は取り消せません。"
          }
          confirmLabel="完全に削除"
          onConfirm={() => void handleConfirmDestructive()}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </section>
  );
};
