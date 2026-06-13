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
  /** display エリアの click で edit モードへ入る */
  enterEditOnClick: () => void;
  /**
   * display エリアの keydown ハンドラ（Enter / Space で edit 起動）
   * @param e - React の keyboard イベント
   */
  enterEditOnKey: (e: KeyboardEvent<HTMLDivElement>) => void;
  /**
   * textarea の keydown ハンドラ（Cmd/Ctrl+Enter で確定 / Esc でキャンセル / IME 抑止）
   * @param e - React の keyboard イベント
   */
  submitOrCancelOnKey: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
};

/**
 * MarkdownBody の display↔edit モード切替・キーバインドをまとめたフック。
 *
 * - body が変わっても hook 内 state は自動リセットしない。呼び出し側で
 *   `<MarkdownBody key={task.id} ... />` のように key で再マウントする契約。
 * - 未変更判定は strict equality (`editValue === body`)。Markdown 本文は
 *   先頭/末尾の空白も意味を持つため trim 比較を採用しない。
 * - IME 変換中（`nativeEvent.isComposing`）の Cmd/Ctrl+Enter は commit を
 *   呼ばないが、preventDefault + stopPropagation は先行して実行する
 *   （親に Esc-like なキー経路を漏らさない）。
 * - textarea mount 時の focus + 末尾カーソル設定は DOM 操作のため呼び出し側
 *   （MarkdownBody）に閉じ込め、hook は DOM 参照を公開 API に含めない。
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

  const enterEditOnClick = useCallback(() => {
    if (!isEditable) {
      return;
    }
    enterEditMode();
  }, [isEditable, enterEditMode]);

  const enterEditOnKey = useCallback(
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

  const submitOrCancelOnKey = useCallback(
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
        // document の useEscToClose 遮断には stopPropagation だけで十分。
        // IME 変換中は preventDefault を呼ばず IME 側の既定動作（変換候補のキャンセル）を残す。
        e.stopPropagation();
        if (e.nativeEvent.isComposing) {
          return;
        }
        e.preventDefault();
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
    enterEditOnClick,
    enterEditOnKey,
    submitOrCancelOnKey,
  };
};
