import type { ChangeEvent, KeyboardEvent, RefObject } from "react";
import { useEffect, useId, useRef, useState } from "react";

/** useInlineColumnNameInput の引数 */
export type UseInlineColumnNameInputArgs = {
  /** 編集開始時に input へ入れる初期値（ColumnHeader=現在名 / AddColumnButton=""） */
  initialValue: string;
  /**
   * 自己名。指定時（ColumnHeader）は「trim 後 === currentName」を no-op 成功として扱い、
   * 重複判定から自己名を除外する。未指定（AddColumnButton）は空文字のみ no-op、自己除外なし。
   */
  currentName?: string;
  /**
   * 重複チェックに用いる既存カラム名。配列（ColumnHeader の自己除外済み prop）でも
   * 関数（AddColumnButton の Context 由来 existingNames()）でも受けられるようにする。
   */
  existingNames: readonly string[] | (() => readonly string[]);
  /** 編集開始時に select() も行うか（ColumnHeader=true / AddColumnButton=false） */
  selectOnFocus?: boolean;
  /**
   * 確定成功時に呼ぶコールバック（onRename / onAdd を統一）。
   * Promise を返した場合は await し、reject 時は edit 維持・入力保持。
   * @param trimmed - trim 済みの入力値
   */
  onCommit: (trimmed: string) => void | Promise<void>;
};

/** `<input>` に spread する配線束（getInputProps の返り値） */
export type ColumnNameInputFieldProps = {
  /** input 要素への ref（focus / select 副作用の対象） */
  ref: RefObject<HTMLInputElement | null>;
  /** 現在の入力値 */
  value: string;
  /**
   * 入力変更ハンドラ
   * @param e - input の change イベント
   */
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  /**
   * キーダウンハンドラ（Enter 確定 / Escape キャンセル / IME 抑止）
   * @param e - input の keydown イベント
   */
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** blur ハンドラ（未確定なら cancel、busy 中は無視） */
  onBlur: () => void;
  /** 確定処理中は disabled */
  disabled: boolean;
  /** input の aria-label */
  "aria-label": string;
  /** 重複時 true */
  "aria-invalid": boolean;
  /** 重複時のみエラー <p> の id を指す */
  "aria-describedby": string | undefined;
};

/** useInlineColumnNameInput の戻り値（消費者向け表面はこれだけ） */
export type UseInlineColumnNameInputResult = {
  /** 編集モードか（呼び出し側の描画分岐に使う） */
  isEditing: boolean;
  /** 重複エラー表示フラグ（ColumnNameInput が使う） */
  isDuplicate: boolean;
  /** エラー <p> の id（ColumnNameInput が使う。input の aria-describedby と共有） */
  errorId: string;
  /** 編集開始。呼び出し側で dragGuard 等を噛ませてから呼ぶ */
  startEditing: () => void;
  /** 確定（テスト・特殊操作用に公開。通常は getInputProps().onKeyDown 経由） */
  confirm: () => Promise<boolean>;
  /** キャンセル（同上） */
  cancel: () => void;
  /**
   * <input> に spread する配線束を返す。ref / value / onChange / onKeyDown /
   * onBlur / disabled / aria-* をまとめて返し、呼び出し側の props 素通しを無くす。
   */
  getInputProps: () => ColumnNameInputFieldProps;
};

/** input の aria-label（両呼び出し側で共通のため定数化） */
const INPUT_ARIA_LABEL = "カラム名";

/**
 * existingNames が配列でも関数でも「現在の既存名配列」を得る。
 * @param source - 既存名の供給元（配列 or 関数）
 * @returns 現在の既存名配列
 */
const resolveExistingNames = (
  source: readonly string[] | (() => readonly string[]),
): readonly string[] => (typeof source === "function" ? source() : source);

/**
 * ColumnHeader / AddColumnButton で重複するカラム名インライン入力の状態・ハンドラ束を提供する。
 * 状態遷移（IDLE → EDITING → BUSY）を単一実装に集約し、`getInputProps()` で `<input>` に
 * spread できる配線束を返す。
 * @param args - {@link UseInlineColumnNameInputArgs}
 * @returns 編集状態と配線束（{@link UseInlineColumnNameInputResult}）
 */
export const useInlineColumnNameInput = ({
  initialValue,
  currentName,
  existingNames,
  selectOnFocus = false,
  onCommit,
}: UseInlineColumnNameInputArgs): UseInlineColumnNameInputResult => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(initialValue);
  const [isBusy, setIsBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isCancelledRef = useRef(false);
  const reactId = useId();
  const errorId = `${reactId}-error`;

  useEffect(() => {
    if (!isEditing) {
      return;
    }
    inputRef.current?.focus();
    if (selectOnFocus) {
      inputRef.current?.select();
    }
  }, [isEditing, selectOnFocus]);

  const trimmedInput = inputValue.trim();
  const isDuplicate =
    trimmedInput.length > 0 &&
    (currentName === undefined || trimmedInput !== currentName) &&
    resolveExistingNames(existingNames).includes(trimmedInput);

  const startEditing = () => {
    isCancelledRef.current = false;
    setInputValue(initialValue);
    setIsEditing(true);
  };

  const cancel = () => {
    isCancelledRef.current = true;
    setInputValue(initialValue);
    setIsEditing(false);
  };

  const confirm = async (): Promise<boolean> => {
    // re-entrant guard: pending 中の連打 (Enter 連打) を抑止
    if (isBusy) {
      return false;
    }
    const trimmed = inputValue.trim();
    const isNoOp =
      trimmed.length === 0 ||
      (currentName !== undefined && trimmed === currentName);
    if (isNoOp) {
      isCancelledRef.current = true;
      setInputValue(initialValue);
      setIsEditing(false);
      return true;
    }
    if (resolveExistingNames(existingNames).includes(trimmed)) {
      return false;
    }
    setIsBusy(true);
    try {
      await onCommit(trimmed);
    } catch {
      // 失敗時は edit mode を維持し、ユーザの入力を保持する
      // (caller 側で error toast 等の通知が出ている前提)
      setIsBusy(false);
      return false;
    }
    setIsBusy(false);
    isCancelledRef.current = true;
    setIsEditing(false);
    return true;
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (e.nativeEvent.isComposing) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      void confirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  };

  const handleBlur = () => {
    // isBusy 中は input が disabled 化により blur が発火するが、
    // pending 中の cancel は edit mode を閉じてユーザの入力を失わせるため無視する
    if (isBusy) {
      return;
    }
    if (!isCancelledRef.current) {
      cancel();
    }
    isCancelledRef.current = false;
  };

  const getInputProps = (): ColumnNameInputFieldProps => ({
    ref: inputRef,
    value: inputValue,
    onChange: (e) => setInputValue(e.target.value),
    onKeyDown: handleKeyDown,
    onBlur: handleBlur,
    disabled: isBusy,
    "aria-label": INPUT_ARIA_LABEL,
    "aria-invalid": isDuplicate,
    "aria-describedby": isDuplicate ? errorId : undefined,
  });

  return {
    isEditing,
    isDuplicate,
    errorId,
    startEditing,
    confirm,
    cancel,
    getInputProps,
  };
};
