import type { ReactNode } from "react";
import { createContext, useId } from "react";

type TaskFormLabelsContextValue = {
  inputId: string;
  disabled: boolean;
};

/**
 * TaskFormLabels 配下の LabelChip / LabelInput が参照する context。
 * inputId は label の htmlFor と input の id を結ぶため root で発行し共有する。
 */
export const TaskFormLabelsContext =
  createContext<TaskFormLabelsContextValue | null>(null);

type TaskFormLabelsProps = {
  /** 無効化（chip の × ボタンと input の両方に伝播） */
  disabled: boolean;
  /** ラベル chip 群と input を compose する slot */
  children?: ReactNode;
};

/**
 * ラベル入力セクションのレイアウト枠。
 * `<label>` とラベルテキスト、chip コンテナを描画し、`useId` で発行した inputId と
 * disabled を context で子コンポーネントへ供給する compound コンポーネント。
 * 状態は親から `LabelChip` / `LabelInput` 単位で渡す。
 * @param props - {@link TaskFormLabelsProps}
 * @returns ラベル入力レイアウト
 */
export const TaskFormLabels = ({ disabled, children }: TaskFormLabelsProps) => {
  const id = useId();
  const inputId = `${id}-labels`;
  return (
    <TaskFormLabelsContext.Provider value={{ inputId, disabled }}>
      <div>
        <label
          htmlFor={inputId}
          className="mb-1 block text-xs font-medium text-gray-700"
        >
          ラベル
        </label>
        <div className="flex flex-wrap items-center gap-1.5">{children}</div>
      </div>
    </TaskFormLabelsContext.Provider>
  );
};
