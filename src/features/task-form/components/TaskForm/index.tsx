import { useId, useMemo } from "react";
import { Button } from "@/components/Button";
import { TaskLinks } from "@/domains/task-links";
import { useLabelsInput } from "@/features/task-form/hooks/useLabelsInput";
import { useLinksInput } from "@/features/task-form/hooks/useLinksInput";
import { useTaskFormFields } from "@/features/task-form/hooks/useTaskFormFields";
import type { TaskFormValues } from "@/features/task-form/types";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";
import { TaskFormActions } from "./TaskFormActions";
import { TaskFormBody } from "./TaskFormBody";
import { TaskFormLabels } from "./TaskFormLabels";
import { LabelChip } from "./TaskFormLabels/LabelChip";
import { LabelInput } from "./TaskFormLabels/LabelInput";
import { TaskFormLinks } from "./TaskFormLinks";
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
  /**
   * 親フィールドのみを変更不可にするフラグ。
   * サブIssue 追加経路で親が自動セットされた状態を保護するために使う。
   * parentCandidates が undefined のときは無視される。
   */
  parentReadOnly?: boolean;
  /** 重複判定に使う既存タスク一覧。未指定なら DUPLICATE 判定なし。 */
  existingTasks?: readonly Task[];
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
  parentReadOnly,
  existingTasks,
  isSubmitting = false,
  submitLabel = "作成",
  cancelLabel = "キャンセル",
  onSubmit,
  onCancel,
}: TaskFormProps) => {
  const labelsInputId = `${useId()}-labels`;
  const labels = useLabelsInput();
  // links state は parent 非依存。先に呼ぶことで循環依存を避ける。
  const links = useLinksInput();
  const fields = useTaskFormFields({
    initialStatus,
    initialParent,
    parentFieldVisible: parentCandidates !== undefined,
    isSubmitting,
    existingTasks,
    onSubmit,
    finalizeLabels: labels.finalizeLabels,
    finalizeLinks: links.finalizeLinks,
  });
  const parentValue = fields.state.values.parent;
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
          onKeyDown={labels.handleKeyDown}
          onBlur={() => labels.dispatch({ type: "commit" })}
          disabled={isSubmitting}
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
