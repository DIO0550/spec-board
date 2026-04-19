import type { KeyboardEvent } from "react";
import { useRef, useState } from "react";
import type { ValueOf } from "@/types/utility";

/** 表示モード（display）と編集モード（edit）を表す enum 相当の定数 */
const Mode = {
  Display: "display",
  Edit: "edit",
} as const;
type Mode = ValueOf<typeof Mode>;

const DISPLAY_CLASS_NAME =
  "w-full cursor-pointer truncate rounded border-0 bg-transparent px-1 py-0.5 text-left text-lg font-semibold text-gray-900 hover:bg-gray-100 focus:outline-none";
const EDIT_CLASS_NAME =
  "w-full rounded border border-blue-400 px-1 py-0.5 text-lg font-semibold text-gray-900 outline-none";

/** EditableText の Props */
type EditableTextProps = {
  /** 表示・編集する値 */
  value: string;
  /**
   * 編集確定時のコールバック
   * @param value - 確定された値（trim 済み）
   */
  onConfirm: (value: string) => void;
  /** スクリーンリーダー向けの accessible name。指定を推奨 */
  ariaLabel?: string;
};

/**
 * クリックで編集モードに切り替わるインラインテキスト編集コンポーネント。
 * DOM は `<input>` 単体で、mode に応じて readOnly / className / data-testid を切り替える。
 * useEffect / 隠し ref / flushSync / 明示的な blur() 呼び出しを使わず、
 * 副作用はすべてイベントハンドラに閉じ込めている。
 * @param props - {@link EditableTextProps}
 * @returns インライン編集要素
 */
export const EditableText = ({
  value,
  onConfirm,
  ariaLabel,
}: EditableTextProps) => {
  const [mode, setMode] = useState<Mode>(Mode.Display);
  // editValue は Edit モード中のみ意味を持つ一時状態。
  // Display 中は <input value={value}> で外部 value を直接描画するため
  // 同期不要。click ハンドラで Edit 遷移時に明示的に setEditValue(value) する。
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  /** 編集内容を確定する。trim 後が空 or 未変更なら onConfirm を呼ばない */
  const commit = () => {
    const trimmed = editValue.trim();
    if (trimmed.length === 0) {
      setEditValue(value);
    } else if (trimmed !== value) {
      onConfirm(trimmed);
    }
    setMode(Mode.Display);
    // blur() は呼ばない。input は unmount されず readOnly 化するだけ。
    // 本物の blur（別要素クリック等）のみが handleBlur を発火させるため、
    // Enter 経路と blur 経路が独立し、二重 commit が構造的に起きない。
  };

  /** 編集をキャンセルし元の値に戻す */
  const cancel = () => {
    setEditValue(value);
    setMode(Mode.Display);
  };

  const enterEditMode = () => {
    // Edit 開始時点の最新 value に同期。useEffect 無しで外部 value 追随を実現する。
    setEditValue(value);
    setMode(Mode.Edit);
    inputRef.current?.select();
  };

  const handleClick = () => {
    if (mode === Mode.Display) {
      enterEditMode();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Display 中の Enter / Space はキーボードのみでの編集起動経路。
    // 旧 <button> ベース DOM 構造での Enter/Space アクティベーションと等価。
    if (mode === Mode.Display) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        enterEditMode();
      }
      return;
    }

    if (e.key === "Enter") {
      // IME 変換確定の Enter は編集確定と区別する。
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      e.stopPropagation();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  };

  const handleBlur = () => {
    // 自然な blur（別要素クリック / Tab）のみここに来る。
    // Enter/Escape は `.blur()` を呼ばないので、このハンドラを経由しない。
    if (mode === Mode.Edit) {
      commit();
    }
  };

  const isEditMode = mode === Mode.Edit;

  return (
    <input
      ref={inputRef}
      type="text"
      value={isEditMode ? editValue : value}
      readOnly={!isEditMode}
      onClick={handleClick}
      onChange={(e) => setEditValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      className={isEditMode ? EDIT_CLASS_NAME : DISPLAY_CLASS_NAME}
      aria-label={ariaLabel}
      data-testid={isEditMode ? "editable-text-input" : "editable-text-display"}
    />
  );
};
