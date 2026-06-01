import type { CSSProperties } from "react";
import { LabelRegistry } from "@/domains/label-registry";
import type { LabelDefinition } from "@/lib/tauri";
import { useLabelList } from "../../hooks/useLabelList";

/**
 * ラベル 1 件のスワッチに適用する色スタイルを解決する。
 * 優先順位は color（マスタ定義色） → group（明示グループ） → name（prefix 由来）。
 * color がある場合はその単色を背景に使い、無い場合は LabelRegistry の
 * グループトークン（fg/bg/bd）を適用する。CSS 変数は作らずインライン style に束ねる。
 * group は「定義されているか」で判定する（空文字も定義済みとして tokensForGroup に渡し、
 * 既定色へ正規化させる）。未定義のときだけ name prefix からグループを導出する。
 * @param label - ラベルマスタ定義 1 件
 * @returns スワッチ要素へ束ねるインライン style
 */
const resolveSwatchStyle = (label: LabelDefinition): CSSProperties => {
  if (label.color) {
    return { backgroundColor: label.color };
  }
  const tokens =
    label.group !== undefined
      ? LabelRegistry.tokensForGroup(label.group)
      : LabelRegistry.tokensForLabel(label.name);
  return {
    color: tokens.fg,
    backgroundColor: tokens.bg,
    borderColor: tokens.bd,
  };
};

/**
 * ラベルレジストリの読み取り専用一覧タブ。
 * 取得は useLabelList に委譲し、本体は取得状態に応じた描画のみ行う。
 * 各ラベルは color → group → name の優先順位で色を解決し、
 * CSS 変数を作らずインライン style にバインドしてプレビューする。
 * @returns ラベル一覧パネル
 */
export const LabelSettingsTab = () => {
  const state = useLabelList();

  if (state.kind === "loading") {
    return <p className="text-sm text-gray-500">読み込み中…</p>;
  }
  if (state.kind === "error") {
    return (
      <p className="text-sm text-gray-500">ラベルを読み込めませんでした</p>
    );
  }
  if (state.labels.length === 0) {
    return <p className="text-sm text-gray-500">ラベルなし</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {state.labels.map((label) => (
        <li key={label.name}>
          <span
            className="inline-flex items-center rounded border px-1.5 py-0.5 text-xs"
            style={resolveSwatchStyle(label)}
          >
            {label.name}
          </span>
        </li>
      ))}
    </ul>
  );
};
