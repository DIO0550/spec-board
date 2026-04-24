import type { ReactNode } from "react";

type TaskFormLabelsProps = {
  /** `<label>` の htmlFor。caller 側で useId などで発行し、LabelInput の id と合わせる */
  htmlFor: string;
  /** ラベル chip 群と input を compose する slot */
  children?: ReactNode;
};

/**
 * ラベル入力セクションのレイアウト枠。
 * `<label>` とラベルテキスト、chip コンテナを描画するだけのシンプルな compound の root。
 * `htmlFor` や disabled 等の配線は caller 側で明示的に行う。
 * @param props - {@link TaskFormLabelsProps}
 * @returns ラベル入力レイアウト
 */
export const TaskFormLabels = ({ htmlFor, children }: TaskFormLabelsProps) => {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-xs font-medium text-gray-700"
      >
        ラベル
      </label>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
};
