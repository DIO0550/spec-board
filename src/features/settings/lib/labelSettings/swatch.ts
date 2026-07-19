import type { CSSProperties } from "react";
import type { LabelDefinition, LabelPreview } from "@/domains/label-definition";
import { LabelRegistry } from "@/domains/label-registry";

/**
 * ラベル 1 件のスワッチに適用する色スタイルを解決する。
 * 優先順位は color（マスタ定義色） → effectiveGroup（group が非空ならそれ、空 or 未指定なら name の prefix）。
 * color がある場合はその単色を背景に使い、無い場合は `LabelRegistry.effectiveGroup` で
 * 解決したグループのトークン（fg/bg/bd）を適用する。CSS 変数は作らずインライン style に束ねる。
 * group の空文字 / 空白扱いを `effectiveGroup` に集約することで、テーブルのバッジ表示・derive
 * 集計と同じグループ判定を 1 箇所に統一する（バッジ色とバッジ名の食い違いを防ぐ）。
 * @param label - ラベルマスタ定義 1 件
 * @returns スワッチ要素へ束ねるインライン style
 */
export const resolveLabelSwatchStyle = (
  label: LabelDefinition | LabelPreview,
): CSSProperties => {
  if (label.color) {
    return { backgroundColor: label.color };
  }
  const tokens = LabelRegistry.tokensForGroup(
    LabelRegistry.effectiveGroup(label),
  );
  return {
    color: tokens.fg,
    backgroundColor: tokens.bg,
    borderColor: tokens.bd,
  };
};
