import type { ButtonHTMLAttributes } from "react";

/** Button の外観 variant */
export type ButtonVariant = "primary" | "secondary";

const VARIANT_CLASS_NAME: Record<ButtonVariant, string> = {
  primary:
    "rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50",
  secondary:
    "rounded px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50",
};

type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className"
> & {
  /** 外観バリアント */
  variant: ButtonVariant;
} & {
  [key: `data-${string}`]: string | number | boolean | undefined;
};

/**
 * 共通ボタン。variant で primary / secondary を切り替え、その他の HTML 属性は透過する。
 * `type` のデフォルトは `"button"`（フォーム内で予期せず submit しないための安全デフォルト）。
 * `className` は variant から決定する固定値で上書きする（外部指定は無視される）。
 * @param props - {@link ButtonProps}
 * @returns ボタン要素
 */
export const Button = ({ variant, type = "button", ...rest }: ButtonProps) => {
  return (
    <button {...rest} type={type} className={VARIANT_CLASS_NAME[variant]} />
  );
};
