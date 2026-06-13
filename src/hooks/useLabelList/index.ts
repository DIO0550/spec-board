import { useEffect, useState } from "react";
import { getLabels, type LabelDefinition } from "@/lib/tauri";

/** ラベル一覧の取得状態（読み取り系のため失敗トーストは出さない）。 */
export type LabelListState =
  | { kind: "loading" }
  | { kind: "loaded"; labels: LabelDefinition[] }
  | { kind: "error" };

/**
 * 現在のプロジェクトのラベルマスタ一覧を取得するフック。
 * マウント時に getLabels() を 1 回呼ぶ。Strict-mode 二重マウント対策で
 * cancelled フラグを持ち、アンマウント後の setState を抑止する。
 * ok({labels:[]})（labels.yml 不在 / 0 件）は loaded（空一覧）として返す。
 * @returns 取得状態 LabelListState
 */
export const useLabelList = (): LabelListState => {
  const [state, setState] = useState<LabelListState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void getLabels().then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setState({ kind: "loaded", labels: result.value.labels });
        return;
      }
      setState({ kind: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
};
