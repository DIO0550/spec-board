import { useCallback } from "react";
import type { TaskFormValues } from "@/features/task-form/types";
import type { CreateTaskParams } from "@/lib/tauri";
import type { ProjectError } from "@/providers/ProjectProvider";
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

/** submit 成功時の結果。親 Task と失敗したサブIssue の一覧を持つ。 */
export type CreateTaskSubmitOutcome = {
  /** 作成された親タスク */
  parent: Task;
  /** 作成に失敗したサブIssue（タイトルとエラー）。空配列なら全件成功 */
  failedSubIssues: { title: string; error: ProjectError }[];
};

export type UseTaskCreateResult = {
  /**
   * 親を作成し、成功時は subIssueTitles を直列ループで子作成する。
   * 親失敗時は Result.err（子は作成しない）。子の部分失敗はロールバックせず
   * failedSubIssues に積んで Result.ok で返す（親は残す方針）。
   * injected createTask が契約通り Result を返す限り throw しない。
   * 契約違反（reject/throw）時はそのまま再 throw する。
   *
   * 送信中フラグ・二重送信ガードはこの hook では持たず、所有者である
   * モーダル層（TaskCreateScreen）が一元管理する。この hook は
   * フォーム値の変換と invoke だけに徹する。
   * @param values TaskCreateScreen が submit したフォーム値
   * @returns 成功時 CreateTaskSubmitOutcome、親作成失敗時 ProjectError を含む Result
   */
  submit: (
    values: TaskFormValues,
  ) => Promise<Result<CreateTaskSubmitOutcome, ProjectError>>;
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
  links: values.links,
  body: values.body,
  ...(values.priority !== undefined && { priority: values.priority }),
  ...(values.parent !== undefined && { parent: values.parent }),
  ...(values.fileName !== undefined && { fileName: values.fileName }),
  ...(values.due !== undefined && values.due !== "" && { due: values.due }),
  ...(values.draft === true && { draft: true }),
});

/**
 * タスク作成 invoke を呼び出すパラメトリックフック。
 * フォーム値の変換と invoke だけを担い、送信中 state は持たない。
 * @param options createTask を含む依存
 * @returns submit 関数
 */
export const useTaskCreate = (
  options: UseTaskCreateOptions,
): UseTaskCreateResult => {
  const { createTask } = options;

  const submit = useCallback(
    async (
      values: TaskFormValues,
    ): Promise<Result<CreateTaskSubmitOutcome, ProjectError>> => {
      const parentResult = await createTask(toCreateTaskParams(values));
      if (!parentResult.ok) {
        // 親の作成に失敗したら子は 1 件も作らない。
        return Result.err(parentResult.error);
      }
      const parent = parentResult.value;
      // サブIssue は直列に作成し、失敗してもループを継続する（ロールバックしない）。
      // 子の status / draft は親フォームの値を、parent は連番回避後の確定パスを引き継ぐ。
      const failedSubIssues: { title: string; error: ProjectError }[] = [];
      for (const title of values.subIssueTitles) {
        const childResult = await createTask({
          title,
          status: values.status,
          parent: parent.filePath,
          ...(values.draft === true && { draft: true }),
        });
        if (!childResult.ok) {
          failedSubIssues.push({ title, error: childResult.error });
        }
      }
      return Result.ok({ parent, failedSubIssues });
    },
    [createTask],
  );

  return { submit };
};
