import type { KeyboardEvent } from "react";
import { useCallback, useState } from "react";
import type { ValueOf } from "@/types/utility";

/** display / edit の二状態を表す定数（ValueOf で union に展開） */
export const MarkdownBodyEditMode = {
  Display: "display",
  Edit: "edit",
} as const;
export type MarkdownBodyEditMode = ValueOf<typeof MarkdownBodyEditMode>;

/** useMarkdownBodyEdit の引数 */
export type UseMarkdownBodyEditArgs = {
  /** 表示・編集対象の Markdown 本文 */
  body: string;
  /**
   * 編集確定時のコールバック。未指定なら display 専用。
   * 空文字の保存可否も呼び出し側に委ねる（hook 内で空チェックは行わない）。
   * @param value - 編集後の本文（trim していない生値）
   */
  onConfirm?: (value: string) => void;
};

/** useMarkdownBodyEdit の戻り値 */
export type UseMarkdownBodyEditResult = {
  /** 現在のモード（"display" / "edit"） */
  mode: MarkdownBodyEditMode;
  /** edit モード中の textarea 入力値 */
  editValue: string;
  /**
   * edit モード中の textarea から呼ぶ onChange 用 setter
   * @param value - 設定する新しい入力値
   */
  setEditValue: (value: string) => void;
  /** `onConfirm` が指定されているか */
  isEditable: boolean;
  /**
   * textarea mount 時に focus + 末尾カーソル設定を行う callback ref
   * @param el - mount された textarea 要素（unmount 時は null）
   */
  textareaRef: (el: HTMLTextAreaElement | null) => void;
  /** display エリアの click ハンドラ */
  handleDisplayClick: () => void;
  /**
   * display エリアの keydown ハンドラ（Enter / Space で edit 起動）
   * @param e - React の keyboard イベント
   */
  handleDisplayKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  /**
   * textarea の keydown ハンドラ（Cmd/Ctrl+Enter / Esc / IME 抑止）
   * @param e - React の keyboard イベント
   */
  handleTextareaKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
};

/**
 * MarkdownBody の display↔edit モード切替・キーバインド・focus 制御をまとめたフック。
 *
 * - body が変わっても hook 内 state は自動リセットしない。呼び出し側で
 *   `<MarkdownBody key={task.id} ... />` のように key で再マウントする契約。
 * - 未変更判定は strict equality (`editValue === body`)。Markdown 本文は
 *   先頭/末尾の空白も意味を持つため trim 比較を採用しない。
 * - IME 変換中（`nativeEvent.isComposing`）の Cmd/Ctrl+Enter は commit を
 *   呼ばないが、preventDefault + stopPropagation は先行して実行する
 *   （親に Esc-like なキー経路を漏らさない）。
 *
 * @param args - body / onConfirm
 * @returns mode / editValue / handlers
 */
export const useMarkdownBodyEdit = (
  args: UseMarkdownBodyEditArgs,
): UseMarkdownBodyEditResult => {
  const { body, onConfirm } = args;

  const [mode, setMode] = useState<MarkdownBodyEditMode>(
    MarkdownBodyEditMode.Display,
  );
  const [editValue, setEditValue] = useState(body);

  const isEditable = onConfirm !== undefined;

  const textareaRef = useCallback((el: HTMLTextAreaElement | null) => {
    if (el === null) {
      return;
    }
    el.focus();
    const end = el.value.length;
    el.selectionStart = end;
    el.selectionEnd = end;
  }, []);

  const enterEditMode = useCallback(() => {
    setEditValue(body);
    setMode(MarkdownBodyEditMode.Edit);
  }, [body]);

  const commit = useCallback(() => {
    if (onConfirm === undefined) {
      return;
    }
    if (editValue === body) {
      setMode(MarkdownBodyEditMode.Display);
      return;
    }
    onConfirm(editValue);
    setMode(MarkdownBodyEditMode.Display);
  }, [onConfirm, editValue, body]);

  const cancel = useCallback(() => {
    setEditValue(body);
    setMode(MarkdownBodyEditMode.Display);
  }, [body]);

  const handleDisplayClick = useCallback(() => {
    if (!isEditable) {
      return;
    }
    enterEditMode();
  }, [isEditable, enterEditMode]);

  const handleDisplayKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!isEditable) {
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        enterEditMode();
      }
    },
    [isEditable, enterEditMode],
  );

  const handleTextareaKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.nativeEvent.isComposing) {
          return;
        }
        commit();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    },
    [commit, cancel],
  );

  return {
    mode,
    editValue,
    setEditValue,
    isEditable,
    textareaRef,
    handleDisplayClick,
    handleDisplayKeyDown,
    handleTextareaKeyDown,
  };
};
