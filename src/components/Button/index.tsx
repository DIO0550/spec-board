import type { ButtonHTMLAttributes } from "react";

/** Button の外観 variant */
export type ButtonVariant = "primary" | "secondary" | "ghost";

/** Button のサイズ（lg はデザインの .btn-lg 相当） */
export type ButtonSize = "md" | "lg";

/** 全 variant / size 共通の基底クラス。 */
const BASE_CLASS_NAME =
  "inline-flex items-center justify-center gap-1.5 rounded-md outline-none transition focus-visible:ring-[3px] focus-visible:ring-accent-soft focus-visible:ring-offset-1 disabled:opacity-50";

const VARIANT_CLASS_NAME: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground hover:brightness-95",
  secondary: "text-foreground hover:bg-surface-muted",
  ghost:
    "border border-transparent bg-transparent text-foreground hover:bg-surface-muted",
};

const SIZE_CLASS_NAME: Record<ButtonSize, string> = {
  md: "h-[30px] px-4 py-2 text-sm",
  lg: "h-[34px] px-4 text-sm font-semibold",
};

type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className"
> & {
  /** 外観バリアント */
  variant: ButtonVariant;
  /** サイズ（既定 md）。lg はデザインの .btn-lg 相当。 */
  size?: ButtonSize;
} & {
  [key: `data-${string}`]: string | number | boolean | undefined;
};

/**
 * 共通ボタン。variant で primary / secondary / ghost、size で md / lg を切り替え、
 * その他の HTML 属性は透過する。
 * `type` のデフォルトは `"button"`（フォーム内で予期せず submit しないための安全デフォルト）。
 * `className` は variant / size から決定する固定値で上書きする（外部指定は無視される）。
 * @param props - {@link ButtonProps}
 * @returns ボタン要素
 */
export const Button = ({
  variant,
  size = "md",
  type = "button",
  ...rest
}: ButtonProps) => {
  return (
    <button
      {...rest}
      type={type}
      className={`${BASE_CLASS_NAME} ${SIZE_CLASS_NAME[size]} ${VARIANT_CLASS_NAME[variant]}`}
    />
  );
};
