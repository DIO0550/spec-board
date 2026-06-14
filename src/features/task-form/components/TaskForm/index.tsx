import type { RefObject } from "react";
import { useEffect, useId, useMemo } from "react";
import { Button } from "@/components/Button";
import { TaskLinks } from "@/domains/task-links";
import { useLabelsInput } from "@/features/task-form/hooks/useLabelsInput";
import { useLinksInput } from "@/features/task-form/hooks/useLinksInput";
import { useTaskFormFields } from "@/features/task-form/hooks/useTaskFormFields";
import type { PreviewFrontmatterInput } from "@/features/task-form/lib/buildPreviewFrontmatter";
import { LabelsField } from "@/features/task-form/lib/fields/labels";
import { isFormDirty } from "@/features/task-form/lib/isFormDirty";
import { SavePathPreview } from "@/features/task-form/lib/savePathPreview";
import type { TaskFormValues } from "@/features/task-form/types";
import { useLabelList } from "@/hooks/useLabelList";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";
import { SavePathPreview as SavePathPreviewView } from "./SavePathPreview";
import { TaskFormActions } from "./TaskFormActions";
import { TaskFormBody } from "./TaskFormBody";
import { TaskFormDraft } from "./TaskFormDraft";
import { TaskFormDue } from "./TaskFormDue";
import { TaskFormFileName } from "./TaskFormFileName";
import { TaskFormLabels } from "./TaskFormLabels";
import { LabelChip } from "./TaskFormLabels/LabelChip";
import { LabelInput } from "./TaskFormLabels/LabelInput";
import { TaskFormLinks } from "./TaskFormLinks";
import { TaskFormParent } from "./TaskFormParent";
import { TaskFormPriority } from "./TaskFormPriority";
import { TaskFormStatus } from "./TaskFormStatus";
import { TaskFormSubIssues } from "./TaskFormSubIssues";
import { TaskFormTitle } from "./TaskFormTitle";

type TaskFormProps = {
  /** 選択肢となるカラム一覧 */
  columns: Column[];
  /** ステータスの初期値 */
  initialStatus: string;
  /** 親タスクの選択候補。未指定の場合は親タスクフィールド自体を非表示にする */
  parentCandidates?: Task[];
  /** 親タスクの初期値（サブIssue 追加時の自動設定用） */
  initialParent?: string;
  /**
   * 親フィールドのみを変更不可にするフラグ。
   * サブIssue 追加経路で親が自動セットされた状態を保護するために使う。
   * parentCandidates が undefined のときは無視される。
   */
  parentReadOnly?: boolean;
  /** links ピッカー候補・選択済み chip の逆引きに使う既存タスク一覧 */
  existingTasks?: readonly Task[];
  /** プロジェクト絶対パス（保存先フルパスプレビュー用。未指定なら相対パス表示） */
  projectPath?: string;
  /** 送信中かどうか（true の間は送信ボタンと入力欄が無効化される） */
  isSubmitting?: boolean;
  /** 送信ボタンのラベル（デフォルト: "作成"） */
  submitLabel?: string;
  /** キャンセルボタンのラベル（デフォルト: "キャンセル"） */
  cancelLabel?: string;
  /**
   * 送信時のコールバック。バリデーション通過後に呼ばれる。
   * @param values - フォームの入力値
   */
  onSubmit: (values: TaskFormValues) => void;
  /** キャンセル時のコールバック */
  onCancel: () => void;
  /**
   * フォーム現在値の変化を親へ通知するコールバック（ライブプレビュー用）。
   * mount 直後にも初期値で一度発火する。
   * 値変化時の `useEffect` 依存に含めるため、参照安定なコールバックを渡すこと。
   * @param values - 集約したフォーム現在値（priority は string、未コミット label も含む）
   */
  onValuesChange?: (values: PreviewFrontmatterInput & { body: string }) => void;
  /** form 要素への ref（キーボードショートカットからの requestSubmit 用） */
  formRef?: RefObject<HTMLFormElement | null>;
  /**
   * dirty（破棄確認が必要な入力があるか）の変化通知。
   * mount 直後に初期状態で一度発火し、以降は boolean が反転した時のみ呼ばれる
   * （毎キーストロークでは呼ばれない）。
   * @param dirty - 入力済み内容の有無
   */
  onDirtyChange?: (dirty: boolean) => void;
};

/**
 * タスク作成フォーム。
 * 状態管理は 2 つの custom hook（useLabelsInput / useTaskFormFields）に委譲し、
 * 本体は 7 つの子コンポーネントに props を渡して描画するだけの薄い配線層。
 * @param props - {@link TaskFormProps}
 * @returns フォーム要素
 */
export const TaskForm = ({
  columns,
  initialStatus,
  parentCandidates,
  initialParent,
  parentReadOnly,
  existingTasks,
  projectPath,
  isSubmitting = false,
  submitLabel = "作成",
  cancelLabel = "キャンセル",
  onSubmit,
  onCancel,
  onValuesChange,
  formRef,
  onDirtyChange,
}: TaskFormProps) => {
  const labelsInputId = `${useId()}-labels`;
  const labels = useLabelsInput();
  // ラベルマスタ由来のサジェスト候補。loading / error 時は候補なし（従来の自由入力のみ）。
  const labelList = useLabelList();
  const labelSuggestions = useMemo(() => {
    if (labelList.kind !== "loaded") {
      return [];
    }
    const names = labelList.labels.map((label) => label.name);
    return LabelsField.suggestionsFor(labels.state, names);
  }, [labelList, labels.state]);
  // links state は parent 非依存。先に呼ぶことで循環依存を避ける。
  const links = useLinksInput();
  const fields = useTaskFormFields({
    initialStatus,
    initialParent,
    parentFieldVisible: parentCandidates !== undefined,
    isSubmitting,
    onSubmit,
    finalizeLabels: labels.finalizeLabels,
    finalizeLinks: links.finalizeLinks,
  });
  const parentValue = fields.state.values.parent;
  // フォーム現在値の変化を親へ通知（ライブプレビュー用）。
  // props 同期や key 再 mount ではなく effect 通知で持ち上げることで、
  // useTaskFormFields の「mount 後 props 不変前提」を壊さない。
  // mount 直後にも発火し、初期値（initialStatus 等）をプレビューへ伝える。
  // 未コミットの labelInput も pure な finalize で取り込み、送信時の値と一致させる。
  // deps はプレビュー YAML / 本文に寄与する値だけに絞る（fileName / subIssues は
  // プレビュー非関連の高頻度入力のため、毎キーストロークの再通知 → Markdown
  // 全文再パースを避ける）。
  const {
    title: previewTitle,
    status: previewStatus,
    priority: previewPriority,
    body: previewBody,
    due: previewDue,
    draft: previewDraft,
  } = fields.state.values;
  useEffect(() => {
    if (onValuesChange === undefined) {
      return;
    }
    onValuesChange({
      title: previewTitle,
      status: previewStatus,
      priority: previewPriority,
      parent: parentValue ?? "",
      body: previewBody,
      labels: LabelsField.finalize(labels.state),
      links: links.links,
      due: previewDue,
      draft: previewDraft,
    });
  }, [
    onValuesChange,
    previewTitle,
    previewStatus,
    previewPriority,
    parentValue,
    previewBody,
    previewDue,
    previewDraft,
    labels.state,
    links.links,
  ]);
  // 保存先パスプレビュー。文字列結合のみで Markdown 再パースを伴わないため、
  // 毎キーストローク再計算でも onValuesChange の fileName 除外最適化と矛盾しない。
  const pathPreview = useMemo(
    () =>
      SavePathPreview.compute({
        title: fields.state.values.title,
        fileName: fields.state.values.fileName,
        parentFilePath:
          parentValue === "" || parentValue === undefined
            ? undefined
            : parentValue,
        existingTaskFilePaths: (existingTasks ?? []).map(
          (task) => task.filePath,
        ),
        projectPath,
      }),
    [
      fields.state.values.title,
      fields.state.values.fileName,
      parentValue,
      existingTasks,
      projectPath,
    ],
  );
  // dirty 判定はフル値（fileName / subIssues 含む）から毎レンダー計算するが、
  // 親への通知は boolean 反転時のみ（useEffect の deps が boolean）のため、
  // onValuesChange の fileName 除外最適化（毎キーストロークの Markdown 再パース回避）を壊さない。
  const dirty = isFormDirty({
    values: fields.state.values,
    labels: labels.state.labels,
    labelInput: labels.state.labelInput,
    links: links.links,
    initialStatus,
    initialParent,
  });
  useEffect(() => {
    if (onDirtyChange === undefined) {
      return;
    }
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  // parent 確定後に候補算出（parent + 選択済みを除外）。一方向依存で循環なし。
  const linkCandidates = useMemo(
    () =>
      TaskLinks.buildCreateLinkCandidates({
        allTasks: existingTasks ?? [],
        parentFilePath: parentValue,
        selectedFilePaths: links.links,
      }),
    [existingTasks, parentValue, links.links],
  );
  // chip の title 表示用に選択済み filePath を全タスクから逆引きする。
  const selectedLinkTasks = links.links
    .map((filePath) =>
      (existingTasks ?? []).find((task) => task.filePath === filePath),
    )
    .filter((task): task is Task => task !== undefined);
  return (
    <form
      ref={formRef}
      className="flex flex-col gap-4"
      data-testid="task-form"
      noValidate
      onSubmit={fields.submit}
    >
      <TaskFormTitle
        value={fields.state.values.title}
        onChange={(value) => fields.dispatch({ type: "title", value })}
        error={fields.state.errors.title}
        disabled={isSubmitting}
      />
      <TaskFormFileName
        value={fields.state.values.fileName}
        onChange={(value) => fields.dispatch({ type: "fileName", value })}
        error={fields.state.errors.fileName}
        disabled={isSubmitting}
      />
      <SavePathPreviewView
        preview={pathPreview}
        // submit 失敗で fileName 欄エラーが表示されている間は同文のライブ警告を抑止する
        //（エラーは次の入力でクリアされるため、入力再開後はライブ警告へ引き継がれる）。
        suppressWarning={fields.state.errors.fileName !== undefined}
      />
      <TaskFormStatus
        columns={columns}
        value={fields.state.values.status}
        onChange={(value) => fields.dispatch({ type: "status", value })}
        disabled={isSubmitting}
      />
      <TaskFormDue
        value={fields.state.values.due}
        onChange={(value) => fields.dispatch({ type: "due", value })}
        disabled={isSubmitting}
      />
      <TaskFormPriority
        value={fields.state.values.priority}
        onChange={(value) => fields.dispatch({ type: "priority", value })}
        disabled={isSubmitting}
      />
      <TaskFormLabels htmlFor={labelsInputId}>
        {labels.state.labels.map((label) => (
          <LabelChip
            key={label}
            label={label}
            onRemove={() => labels.dispatch({ type: "remove", label })}
            disabled={isSubmitting}
          />
        ))}
        <LabelInput
          id={labelsInputId}
          value={labels.state.labelInput}
          onChange={(value) => labels.dispatch({ type: "setInput", value })}
          onKeyDown={labels.commitOnEnter}
          onBlur={() => labels.dispatch({ type: "commit" })}
          disabled={isSubmitting}
          candidates={labelSuggestions}
          onSelect={(label) =>
            labels.dispatch({ type: "commitValue", value: label })
          }
        />
      </TaskFormLabels>
      {parentCandidates !== undefined && (
        <TaskFormParent
          tasks={parentCandidates}
          value={fields.state.values.parent}
          onChange={(value) => fields.dispatch({ type: "parent", value })}
          disabled={isSubmitting}
          readOnly={parentReadOnly}
        />
      )}
      <TaskFormLinks
        links={links.links}
        selectedTasks={selectedLinkTasks}
        candidates={linkCandidates}
        onAdd={links.addLink}
        onRemove={links.removeLink}
        disabled={isSubmitting}
      />
      <TaskFormBody
        value={fields.state.values.body}
        onChange={(value) => fields.dispatch({ type: "body", value })}
        disabled={isSubmitting}
      />
      <TaskFormSubIssues
        value={fields.state.values.subIssues}
        onChange={(value) => fields.dispatch({ type: "subIssues", value })}
        error={fields.state.errors.subIssues}
        disabled={isSubmitting}
      />
      <TaskFormDraft
        checked={fields.state.values.draft}
        onChange={(value) => fields.dispatch({ type: "draft", value })}
        disabled={isSubmitting}
      />
      <TaskFormActions>
        <Button
          variant="secondary"
          onClick={onCancel}
          disabled={isSubmitting}
          data-testid="task-form-cancel"
        >
          {cancelLabel}
        </Button>
        <Button
          variant="primary"
          type="submit"
          disabled={isSubmitting}
          data-testid="task-form-submit"
        >
          {submitLabel}
        </Button>
      </TaskFormActions>
    </form>
  );
};
