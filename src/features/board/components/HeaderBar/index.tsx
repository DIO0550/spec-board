import type { AppView } from "@/hooks/useAppView";

/** ヘッダーバーの Props */
type HeaderBarProps = {
  /** プロジェクト名（未指定時は「spec-board」を表示） */
  projectName?: string;
  /** 現在の画面区分。settings 中のみ「ボードへ戻る」表記に切替（board / detail は「設定」、既定 board） */
  view?: AppView;
  /** 設定ボタンのクリックハンドラ */
  onSettingsClick: () => void;
  /** 「開く」ボタンのクリックハンドラ */
  onOpenClick: () => void;
};

/**
 * ボード上部のヘッダーバー
 * @param props - {@link HeaderBarProps}
 * @returns ヘッダーバー要素
 */
export const HeaderBar = ({
  projectName,
  view = "board",
  onSettingsClick,
  onOpenClick,
}: HeaderBarProps) => {
  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
      <h1 className="text-lg font-semibold text-gray-800">
        {projectName ?? "spec-board"}
      </h1>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSettingsClick}
          className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
        >
          {view === "settings" ? "ボードへ戻る" : "設定"}
        </button>
        <button
          type="button"
          onClick={onOpenClick}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          開く
        </button>
      </div>
    </header>
  );
};
