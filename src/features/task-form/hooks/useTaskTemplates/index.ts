import { useEffect, useState } from "react";
import { getTaskTemplates } from "@/lib/tauri";
import type { TaskTemplatePayload } from "@/lib/tauri/taskCommands/types";

/** タスクテンプレート一覧の取得状態（読み取り系のため失敗トーストは出さない）。 */
export type TaskTemplatesState =
  | { kind: "loading" }
  | { kind: "loaded"; templates: TaskTemplatePayload[] }
  | { kind: "error" };

/**
 * `.spec-board/templates/*.md` 由来のタスクテンプレート一覧を取得するフック。
 * マウント時に getTaskTemplates() を 1 回呼ぶ。Strict-mode 二重マウント対策で
 * cancelled フラグを持ち、アンマウント後の setState を抑止する。
 * ok({templates:[]})（templates/ 不在 / 0 件）は loaded（空一覧）として返す。
 * @returns 取得状態 TaskTemplatesState
 */
export const useTaskTemplates = (): TaskTemplatesState => {
  const [state, setState] = useState<TaskTemplatesState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void getTaskTemplates().then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setState({ kind: "loaded", templates: result.value.templates });
        return;
      }
      setState({ kind: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
};
