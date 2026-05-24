import { useCallback, useState } from "react";
import { ProjectError } from "@/features/board";
import type { TaskFormValues } from "@/features/task-form/types";
import type { CreateTaskParams } from "@/lib/tauri";
import type { Task } from "@/types/task";
import { Result } from "@/utils/result";

export type UseTaskCreateOptions = {
  /**
   * 実行する create 関数。通常は useProject().createTask を渡す。
   * 引数で受けることで queue / projectVersion 保護を流用しつつ、
   * hook 自体を toast / modal 非依存に保つ。
   * @param params create_task に渡すパラメータ
   * @returns 成功時 Task、失敗時 ProjectError を含む Result
   */
  createTask: (params: CreateTaskParams) => Promise<Result<Task, ProjectError>>;
};

export type UseTaskCreateResult = {
  /**
   * フォーム値を CreateTaskParams に変換し createTask を呼ぶ。
   * 送信中は isSubmitting=true。
   * injected createTask が契約通り Result を返す限り throw しない。
   * 契約違反（reject/throw）時は finally で isSubmitting を戻したうえで再 throw する。
   * 送信中の再呼び出しは Result.err(invalidState) で短絡する。
   * @param values TaskCreateModal が submit したフォーム値
   * @returns 成功時 Task、失敗時 ProjectError を含む Result
   */
  submit: (values: TaskFormValues) => Promise<Result<Task, ProjectError>>;
  /** 送信中フラグ。表示専用。 */
  isSubmitting: boolean;
};

/**
 * TaskFormValues を BE 仕様の CreateTaskParams に変換する。
 * priority / parent は undefined のとき key 自体を含めず、BE 側で None として扱わせる。
 * @param values フォーム値
 * @returns BE invoke 用のパラメータ
 */
const toCreateTaskParams = (values: TaskFormValues): CreateTaskParams => ({
  title: values.title,
  status: values.status,
  labels: values.labels,
  body: values.body,
  ...(values.priority !== undefined && { priority: values.priority }),
  ...(values.parent !== undefined && { parent: values.parent }),
});

/**
 * タスク作成 invoke を呼び出すパラメトリックフック。
 * @param options createTask を含む依存
 * @returns submit 関数と isSubmitting フラグ
 */
export const useTaskCreate = (
  options: UseTaskCreateOptions,
): UseTaskCreateResult => {
  const { createTask } = options;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(
    async (values: TaskFormValues): Promise<Result<Task, ProjectError>> => {
      if (isSubmitting) {
        return Result.err(ProjectError.invalidState("送信中です"));
      }
      setIsSubmitting(true);
      try {
        return await createTask(toCreateTaskParams(values));
      } finally {
        setIsSubmitting(false);
      }
    },
    [createTask, isSubmitting],
  );

  return { submit, isSubmitting };
};
