import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PreviewPane } from "@/features/task-form/components/PreviewPane";
import { TaskForm } from "@/features/task-form/components/TaskForm";
import type { PreviewFrontmatterInput } from "@/features/task-form/lib/buildPreviewFrontmatter";
import type { TaskFormValues } from "@/features/task-form/types";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";

/** プレビューへ渡すフォーム現在値（frontmatter フィールド + 本文）。 */
type PreviewValues = PreviewFrontmatterInput & { body: string };

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
  /**
   * 送信時のコールバック。reject した場合は画面を閉じない。
   * 親側でトースト通知などのエラーハンドリングを行う想定。
   * @param values - フォームの入力値
   */
  onSubmit: (values: TaskFormValues) => Promise<void>;
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
  priority: "",
  labels: [],
  parent: "",
  links: [],
  body: "",
});

/**
 * form を送信する（キーボードショートカット用）。
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
 * 全画面2ペインのタスク作成画面。左=入力フォーム / 右=ライブプレビュー。
 * 送信契約（二重送信防止・成功で自動クローズ・reject 非クローズ）は旧作成モーダルから踏襲する。
 * ⌘（mac）/ Ctrl（Windows/Linux）+Enter で保存し、Esc / キャンセルは入力ありなら
 * 破棄確認ダイアログを経由する（未入力なら即閉じる）。
 * @param props - {@link TaskCreateScreenProps}
 * @returns 2ペイン作成画面要素
 */
export const TaskCreateScreen = (props: TaskCreateScreenProps) => {
  const { onSubmit, onClose, initialStatus } = props;
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

  const handleSubmit = useCallback(
    async (values: TaskFormValues) => {
      if (submittingRef.current) {
        return;
      }
      submittingRef.current = true;
      setIsSubmitting(true);
      try {
        await onSubmit(values);
        onClose();
      } catch {
        // 親側でトースト通知済み。画面は閉じない。
      } finally {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [onSubmit, onClose],
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
      className="flex h-full min-h-0 gap-6 p-6"
      data-testid="task-create-screen"
    >
      <div className="min-w-0 flex-1 overflow-y-auto">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          新規タスクを作成
        </h2>
        <TaskForm
          columns={props.columns}
          initialStatus={props.initialStatus}
          initialParent={props.initialParent}
          parentCandidates={props.parentCandidates}
          parentReadOnly={props.parentReadOnly}
          existingTasks={props.existingTasks}
          projectPath={props.projectPath}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          onValuesChange={setPreviewValues}
          onCancel={requestClose}
          formRef={formRef}
          onDirtyChange={setIsDirty}
        />
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto border-l border-surface-muted pl-6">
        <PreviewPane values={previewValues} />
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
