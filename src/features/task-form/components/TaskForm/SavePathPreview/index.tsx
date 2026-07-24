import type { PreviewTaskFilenamePayload } from "@/lib/tauri/taskCommands/types";

type SavePathPreviewProps = {
  /** 計算済みのプレビュー結果 */
  preview: PreviewTaskFilenamePayload;
  /** fileName 欄エラー表示中に同文警告の二重表示を防ぐための抑止フラグ */
  suppressWarning?: boolean;
};

/**
 * 保存先パスプレビューの表示専用コンポーネント（fileName 欄直下に配置）。
 * 可視のインライン表示のため aria-live を要素へ直接付与する（Toast と同じ流儀。
 * sr-only の LiveRegion はグローバル通知用の別責務のため使わない）。
 * @param props - {@link SavePathPreviewProps}
 * @returns プレビュー領域要素
 */
export const SavePathPreview = ({
  preview,
  suppressWarning = false,
}: SavePathPreviewProps) => {
  return (
    <div aria-live="polite" className="mt-1 text-xs">
      {preview.kind === "path" && (
        <p
          className="truncate font-mono text-muted"
          title={preview.fullPath}
          data-testid="task-form-path-preview"
        >
          {preview.fullPath}
        </p>
      )}
      {preview.kind === "invalid" && !suppressWarning && (
        <p className="text-red-600" data-testid="task-form-path-warning">
          {preview.error}
        </p>
      )}
      {preview.kind === "pending" && (
        <p className="text-muted">
          タイトルまたはファイル名を入力すると保存先パスを表示します
        </p>
      )}
    </div>
  );
};
