import { useLabelsInput } from "@/features/task-form/hooks/useLabelsInput";
import { useTaskFormFields } from "@/features/task-form/hooks/useTaskFormFields";
import type { TaskFormValues } from "@/features/task-form/types";
import type { Column, Task } from "@/types/task";
import { TaskFormActions } from "./TaskFormActions";
import { TaskFormBody } from "./TaskFormBody";
import { TaskFormLabels } from "./TaskFormLabels";
import { TaskFormParent } from "./TaskFormParent";
import { TaskFormPriority } from "./TaskFormPriority";
import { TaskFormStatus } from "./TaskFormStatus";
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
  isSubmitting = false,
  submitLabel = "作成",
  cancelLabel = "キャンセル",
  onSubmit,
  onCancel,
}: TaskFormProps) => {
  const labels = useLabelsInput();
  const fields = useTaskFormFields({
    initialStatus,
    initialParent,
    parentFieldVisible: parentCandidates !== undefined,
    isSubmitting,
    onSubmit,
    commitPendingAndGetLabels: labels.commitPendingAndGetLabels,
  });
  return (
    <form
      className="flex flex-col gap-4"
      data-testid="task-form"
      noValidate
      onSubmit={fields.handleSubmit}
    >
      <TaskFormTitle
        value={fields.state.values.title}
        onChange={(value) => fields.dispatch({ type: "title", value })}
        error={fields.state.errors.title}
        disabled={isSubmitting}
      />
      <TaskFormStatus
        columns={columns}
        value={fields.state.values.status}
        onChange={(value) => fields.dispatch({ type: "status", value })}
        disabled={isSubmitting}
      />
      <TaskFormPriority
        value={fields.state.values.priority}
        onChange={(value) => fields.dispatch({ type: "priority", value })}
        disabled={isSubmitting}
      />
      <TaskFormLabels
        labels={labels.state.labels}
        labelInput={labels.state.labelInput}
        setInput={(value) => labels.dispatch({ type: "setInput", value })}
        commit={() => labels.dispatch({ type: "commit" })}
        remove={(label) => labels.dispatch({ type: "remove", label })}
        handleKeyDown={labels.handleKeyDown}
        disabled={isSubmitting}
      />
      {parentCandidates !== undefined && (
        <TaskFormParent
          tasks={parentCandidates}
          value={fields.state.values.parent}
          onChange={(value) => fields.dispatch({ type: "parent", value })}
          disabled={isSubmitting}
        />
      )}
      <TaskFormBody
        value={fields.state.values.body}
        onChange={(value) => fields.dispatch({ type: "body", value })}
        disabled={isSubmitting}
      />
      <TaskFormActions
        submitLabel={submitLabel}
        cancelLabel={cancelLabel}
        onCancel={onCancel}
        isSubmitting={isSubmitting}
      />
    </form>
  );
};
