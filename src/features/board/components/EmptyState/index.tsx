type EmptyStateProps =
  | { type: "no-project"; onOpenProject: () => void }
  | { type: "empty-project" };

/**
 * @param props - {@link EmptyStateProps}
 * @returns プロジェクト未選択時または空プロジェクト時の案内表示
 */
export const EmptyState = (props: EmptyStateProps) => {
  if (props.type === "no-project") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="text-muted">
          プロジェクトフォルダを選択して開始してください
        </p>
        <button
          type="button"
          onClick={props.onOpenProject}
          className="rounded bg-accent px-4 py-2 text-white hover:brightness-95"
        >
          プロジェクトを開く
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center text-center">
      <p className="text-muted">
        タスクがありません。「+追加」ボタンまたはmdファイルを作成してタスクを追加してください
      </p>
    </div>
  );
};
