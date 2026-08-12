import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PreviewPane } from "@/features/task-form/components/PreviewPane";
import { TaskForm } from "@/features/task-form/components/TaskForm";
import { usePreviewTaskMarkdown } from "@/features/task-form/hooks/usePreviewTaskMarkdown";
import type { CreateTaskSubmitOutcome } from "@/features/task-form/hooks/useTaskCreate";
import type { TaskFormValues } from "@/features/task-form/types";
import type {
  PreviewTaskFilenamePayload,
  PreviewTaskMarkdownParams,
} from "@/lib/tauri/taskCommands/types";
import {
  type ProjectError,
  projectErrorMessage,
  wasNotifiedByInvokeWrapped,
} from "@/providers/ProjectProvider";
import { useToastDispatch } from "@/providers/ToastProvider";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";
import type { Result } from "@/utils/result";
import { PreviewResizer } from "./PreviewResizer";
import { TaskFormFooter } from "./TaskFormFooter";
import { TaskSubbar } from "./TaskSubbar";
import { TaskTopbar } from "./TaskTopbar";

/** プレビューへ渡すフォーム現在値（BE codec 用 draft）。 */
type PreviewValues = PreviewTaskMarkdownParams;

/** プレビュー幅の既定値（px）。 */
const DEFAULT_PREVIEW_WIDTH = 480;

/** パス未確定時に subbar / pv-foot に出すフォールバックファイル名。 */
const FALLBACK_FILE_NAME = "new-issue.md";

export type TaskCreateScreenProps = {
  /** status フィールド用のカラム一覧（必須） */
  columns: Column[];
  /** 初期ステータス（作成元カラム） */
  initialStatus: string;
  /** 親タスクの初期値（サブIssue 追加時の自動設定用） */
  initialParent?: string;
  /** 親タスクの選択候補。未指定なら親フィールドを表示しない。 */
  parentCandidates?: Task[];
  /** 親フィールドのみを変更不可にするフラグ（サブIssue 経路の保護用）。 */
  parentReadOnly?: boolean;
  /** 重複判定に使う既存タスク一覧。 */
  existingTasks: readonly Task[];
  /** プロジェクト絶対パス（保存先フルパスプレビュー用。未指定なら相対パス表示） */
  projectPath?: string;
  /** プロジェクト名（topbar の crumbs 表示用）。 */
  projectName?: string;
  /** 同期バッジに出す監視ファイル数（読み込み済みタスク総数を流用）。 */
  watchedFileCount: number;
  /**
   * 送信時のコールバック。Result を返す薄い callback で、TaskCreateScreen 内部で
   * success / warning(partial-failure) / error(wasNotifiedByInvokeWrapped ガード付き)
   * の toast を出す。Result.err なら画面を閉じない（旧 reject 契約と等価）。
   * @param values - フォームの入力値
   * @returns 親作成の結果 + 失敗したサブIssue 一覧（partial）または ProjectError
   */
  onSubmit: (
    values: TaskFormValues,
  ) => Promise<Result<CreateTaskSubmitOutcome, ProjectError>>;
  /** 画面を閉じるコールバック（成功・キャンセル・Esc）。戻り先は呼び出し側が解決する。 */
  onClose: () => void;
};

/**
 * プレビュー初期値を初期ステータスから組み立てる。
 * @param initialStatus - 初期ステータス
 * @returns 空フォーム相当のプレビュー値
 */
const buildInitialPreview = (initialStatus: string): PreviewValues => ({
  title: "",
  status: initialStatus,
  priority: undefined,
  labels: [],
  parent: undefined,
  links: [],
  due: undefined,
  draft: false,
  body: "",
});

/**
 * 保存先パスプレビューから表示用ファイル名を導出する。
 * @param preview - 保存先パスプレビュー結果（kind で分岐）
 * @returns subbar / pv-foot に出すファイル名
 */
const previewFileNameLabel = (preview: PreviewTaskFilenamePayload): string => {
  if (preview.kind === "path") {
    return preview.fileName;
  }
  return FALLBACK_FILE_NAME;
};

/**
 * footer の save-meta に出す validation ヒントを導出する。
 * @param title - タイトル現在値
 * @param preview - 保存先パスプレビュー結果
 * @returns ヒント文言
 */
const footerSaveHint = (
  title: string,
  preview: PreviewTaskFilenamePayload,
): string => {
  if (title.trim() === "") {
    return "タイトルを入力してください";
  }
  if (preview.kind === "path") {
    return `保存先: ${preview.relPath}`;
  }
  if (preview.kind === "invalid") {
    return preview.error;
  }
  return "保存先を計算しています…";
};

/**
 * form を送信する（キーボードショートカット / footer ボタン共用）。
 * `requestSubmit()` を標準経路とし、未対応環境（happy-dom の旧版等）では
 * cancelable な submit イベントの dispatch にフォールバックする。
 * @param form - 対象 form 要素（null なら何もしない）
 */
const submitFormElement = (form: HTMLFormElement | null): void => {
  if (form === null) {
    return;
  }
  if (typeof form.requestSubmit === "function") {
    form.requestSubmit();
    return;
  }
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
};

/**
 * 全画面2ペインのタスク作成画面。上部 chrome（topbar / subbar）・下部固定フッター・
 * 左=入力フォーム / 右=ライブプレビュー（折りたたみ + リサイズ可）で構成する。
 * 送信契約（二重送信防止・成功で自動クローズ・Result.err 非クローズ）・IME ガード付き
 * Esc/⌘Enter・破棄確認は旧作成画面から温存する。footer の作成ボタンは `<form>` の外に
 * 置かれるため `formRef` 経由の requestSubmit（= ⌘Enter と同一経路）で送信する。
 * @param props - {@link TaskCreateScreenProps}
 * @throws ToastProvider の外でレンダリングされた場合
 * @returns 2ペイン作成画面要素
 */
export const TaskCreateScreen = (props: TaskCreateScreenProps) => {
  const { onSubmit, onClose, initialStatus } = props;
  // 全画面コンポーネントのため、toasts state 変化での再 render を避けるため dispatch のみ subscribe。
  const { showToast } = useToastDispatch();
  const sectionRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);
  // プレビュー用にフォーム現在値を保持（TaskForm からの伝搬で更新）。
  const [previewValues, setPreviewValues] = useState<PreviewValues>(() =>
    buildInitialPreview(initialStatus),
  );
  // 保存先パスプレビューは TaskForm から onPathPreviewChange で受ける。
  // previewValues.fileName は onValuesChange の fileName 除外最適化で最新化されないため使わない。
  const [pathPreview, setPathPreview] = useState<PreviewTaskFilenamePayload>({
    kind: "pending",
  });
  // プレビューの表示/折りたたみと幅（既定 480、clamp は PreviewResizer の computePreviewWidth）。
  const [previewVisible, setPreviewVisible] = useState(true);
  const [previewWidth, setPreviewWidth] = useState(DEFAULT_PREVIEW_WIDTH);

  const previewFileName = previewFileNameLabel(pathPreview);
  const previewMarkdown = usePreviewTaskMarkdown(previewValues);

  const handleSubmit = useCallback(
    async (values: TaskFormValues) => {
      if (submittingRef.current) {
        return;
      }
      submittingRef.current = true;
      setIsSubmitting(true);
      try {
        const result = await onSubmit(values);
        if (!result.ok) {
          // wasNotifiedByInvokeWrapped が true のときは invokeWrapped 層が既に
          // error toast を出している（二重通知防止）。
          if (!wasNotifiedByInvokeWrapped(result.error)) {
            const message = projectErrorMessage(result.error);
            showToast(`タスクの作成に失敗しました: ${message}`, "error");
          }
          // 失敗時は画面を閉じない（旧 reject 契約と等価）。
          return;
        }
        if (result.value.failedSubIssues.length > 0) {
          // 親と成功した子は残す。失敗した子のみ警告（ロールバックしない）。
          showToast(
            `サブIssue ${result.value.failedSubIssues.length} 件の作成に失敗しました`,
            "warning",
          );
        } else {
          showToast("タスクを作成しました", "success");
        }
        onClose();
      } catch {
        // 契約違反の安全弁: onSubmit / useTaskCreate は Result を返す契約だが、
        // injected createTask が契約に反して throw / reject した場合に画面ごとクラッシュ
        // させないため、汎用 error toast を出し画面は閉じない（成功扱いにしない）。
        showToast(
          "タスクの作成に失敗しました: 想定外のエラーが発生しました",
          "error",
        );
      } finally {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [onSubmit, onClose, showToast],
  );

  // Esc/キャンセル: 入力済みなら破棄確認、未入力なら即閉じる。送信中は無効。
  const requestClose = useCallback(() => {
    if (submittingRef.current) {
      return;
    }
    if (isDirty) {
      setIsDiscardDialogOpen(true);
      return;
    }
    onClose();
  }, [isDirty, onClose]);

  // mount 時にビューのランドマークへフォーカスを移し、キーボード/SR フォーカスが
  // 前画面（board / detail）に取り残されないようにする（DetailScreen と同様）。
  useEffect(() => {
    sectionRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // IME 変換中のキー操作は変換確定/キャンセル用なので無視する。
      if (e.isComposing || submittingRef.current) {
        return;
      }
      // 破棄確認ダイアログ表示中は ConfirmDialog 側が Esc を処理するため、
      // 画面側のリスナーは何もしない（二重ハンドリング防止）。
      if (isDiscardDialogOpen) {
        return;
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submitFormElement(formRef.current);
        return;
      }
      if (e.key === "Escape") {
        requestClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isDiscardDialogOpen, requestClose]);

  return (
    <section
      ref={sectionRef}
      aria-label="タスク作成"
      tabIndex={-1}
      className="grid h-full min-h-0 grid-rows-[48px_44px_1fr] overflow-hidden bg-surface"
      data-testid="task-create-screen"
    >
      <TaskTopbar
        projectName={props.projectName}
        projectPath={props.projectPath}
        watchedFileCount={props.watchedFileCount}
        previewVisible={previewVisible}
        onTogglePreview={() => setPreviewVisible((v) => !v)}
      />
      <TaskSubbar fileName={previewFileName} onBack={requestClose} />
      <div
        data-testid="task-create-main"
        className={`grid min-h-0 overflow-hidden ${
          previewVisible
            ? "grid-cols-[minmax(0,1fr)_4px_var(--preview-w)]"
            : "grid-cols-[minmax(0,1fr)_0_0]"
        }`}
        style={{ "--preview-w": `${previewWidth}px` } as React.CSSProperties}
      >
        <div className="flex min-h-0 flex-col overflow-hidden">
          <div
            data-testid="task-create-form-scroll"
            className="relative flex-1 overflow-y-auto px-8 py-6"
          >
            <div className="mx-auto max-w-[600px]">
              <h1 className="mb-1 text-lg font-semibold text-foreground">
                新規タスクを作成
              </h1>
              <p className="mb-5 text-xs leading-relaxed text-muted">
                入力した内容は Markdown
                ファイルとして保存されます。フロントマターにメタ情報が書き込まれます。
              </p>
              <TaskForm
                columns={props.columns}
                initialStatus={props.initialStatus}
                initialParent={props.initialParent}
                parentCandidates={props.parentCandidates}
                parentReadOnly={props.parentReadOnly}
                existingTasks={props.existingTasks}
                isSubmitting={isSubmitting}
                onSubmit={handleSubmit}
                onValuesChange={setPreviewValues}
                onCancel={requestClose}
                formRef={formRef}
                onDirtyChange={setIsDirty}
                onPathPreviewChange={setPathPreview}
                renderActionsInline={false}
              />
            </div>
          </div>
          <TaskFormFooter
            saveHint={footerSaveHint(previewValues.title, pathPreview)}
            canSubmit={previewValues.title.trim() !== ""}
            isSubmitting={isSubmitting}
            onCancel={requestClose}
            onSubmit={() => submitFormElement(formRef.current)}
          />
        </div>
        {previewVisible && <PreviewResizer onWidthChange={setPreviewWidth} />}
        {previewVisible && (
          <PreviewPane
            state={previewMarkdown}
            fileName={previewFileName}
            onCollapse={() => setPreviewVisible(false)}
          />
        )}
      </div>
      {isDiscardDialogOpen && (
        <ConfirmDialog
          title="入力内容を破棄しますか？"
          message="入力した内容は保存されません。"
          confirmLabel="破棄する"
          onConfirm={onClose}
          onCancel={() => setIsDiscardDialogOpen(false)}
        />
      )}
    </section>
  );
};
