import { Button } from "@/components/Button";

type TaskFormFooterProps = {
  /** save-meta 領域に出す validation ヒント（例: 「タイトルを入力してください」）。 */
  saveHint: string;
  /** UI 上の送信可否（タイトル入力済みか等の軽量判定）。 */
  canSubmit: boolean;
  /** 送信中か（送信中はキャンセル / 作成を無効化）。 */
  isSubmitting: boolean;
  /** キャンセル（= requestClose）。 */
  onCancel: () => void;
  /**
   * 作成ボタン click。親は `() => submitFormElement(formRef.current)` を渡し、
   * ⌘Enter と同一の送信経路（requestSubmit）に収斂させる。
   */
  onSubmit: () => void;
};

/**
 * 作成画面の下部固定フッター（form-footer）。
 * 左に save-meta（validation ヒント）、右にキャンセル（ghost）と作成（primary lg）を並べる。
 * 既存 TaskFormActions のボタン compose（testid / 二重送信ガード）を footer 層へ移設して再利用する。
 * 作成ボタンは `<form>` の外に置かれるためネイティブ submit ではなく onSubmit（親の requestSubmit
 * 経路）に結線する。
 * @param props - {@link TaskFormFooterProps}
 * @returns フッター要素
 */
export const TaskFormFooter = (props: TaskFormFooterProps) => {
  return (
    <div className="flex shrink-0 border-t border-border bg-panel px-8 py-3.5">
      <div className="mx-auto flex w-full max-w-[720px] items-center gap-2">
        <span
          className="mr-auto inline-flex items-center gap-1.5 text-[11.5px] text-text-dim"
          data-testid="task-form-save-meta"
        >
          {props.saveHint}
        </span>
        <Button
          variant="ghost"
          size="lg"
          onClick={props.onCancel}
          disabled={props.isSubmitting}
          data-testid="task-form-cancel"
        >
          キャンセル
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={props.onSubmit}
          disabled={!props.canSubmit || props.isSubmitting}
          data-testid="task-form-submit"
        >
          {props.isSubmitting ? "作成中…" : "タスクを作成"}
        </Button>
      </div>
    </div>
  );
};
