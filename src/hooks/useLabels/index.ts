import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LabelDefinition,
  type LabelDefinition as LabelDefinitionType,
} from "@/domains/label-definition";
import { getLabels } from "@/lib/tauri";

/** ラベル定義リソースの取得状態。 */
export type LabelsStatus = "idle" | "loading" | "loaded" | "error";

/**
 * 複数 feature（settings / 将来統合先）で共有するラベル定義リソース。
 * settings 向けの取得点として使う。TaskForm は別途 `useLabelList` を使用する。
 */
export type LabelsResource = {
  /** ラベル定義の配列（定義順）。idle / loading 中は空配列 */
  labels: LabelDefinitionType[];
  /** ラベル名 → 使用タスク件数（BE 由来。settings では App 側で live 上書き可能） */
  usageCounts: Record<string, number>;
  /** name → 定義の Map（テーブル / プレビューが引く） */
  byName: Map<string, LabelDefinitionType>;
  /** 取得状態 */
  status: LabelsStatus;
  /** error 状態時のメッセージ */
  error?: string;
  /** 設定 CRUD 成功後などに呼ぶ再取得関数 */
  reload: () => Promise<void>;
};

type ResourceState = {
  labels: LabelDefinitionType[];
  usageCounts: Record<string, number>;
  status: LabelsStatus;
  error?: string;
};

const IDLE_STATE: ResourceState = {
  labels: [],
  usageCounts: {},
  status: "idle",
};

/**
 * プロジェクト単位のラベル定義リソースを取得する feature 横断の共有フック。
 *
 * - projectKey が undefined（プロジェクト未オープン）のときは getLabels を呼ばず idle。
 * - projectKey が変化したら再取得する（loading → loaded / error）。
 * - in-flight 中に projectKey が変わった場合、古い応答は stale として破棄する。
 * - reload() は現在の projectKey で再取得する（設定 CRUD 後に呼ぶ）。
 *
 * @param projectKey - 現在開いているプロジェクトの識別子（未オープンは undefined）
 * @returns ラベル定義リソース
 */
export const useLabels = (projectKey: string | undefined): LabelsResource => {
  const [state, setState] = useState<ResourceState>(IDLE_STATE);
  // 各 load 呼び出しに採番する世代 id。最新世代の応答だけが state を確定する。
  // 同一 projectKey の重複ロード（初回 + reload）で古い応答が後勝ちしないよう
  // key 比較ではなく世代 id で stale 応答を破棄する。
  const requestIdRef = useRef(0);

  const load = useCallback(async (key: string | undefined): Promise<void> => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (key === undefined) {
      setState(IDLE_STATE);
      return;
    }
    // loading 開始時は前回値を残さずクリアする（projectKey 変更 / reload 時の stale 表示防止）。
    setState({ labels: [], usageCounts: {}, status: "loading" });
    const result = await getLabels();
    // この応答より後に開始された load があれば（key 同一でも）古い応答として捨てる。
    if (requestIdRef.current !== requestId) {
      return;
    }
    if (result.ok) {
      setState({
        labels: LabelDefinition.listFromWire(result.value.labels),
        usageCounts: result.value.usageCounts,
        status: "loaded",
      });
      return;
    }
    setState({
      labels: [],
      usageCounts: {},
      status: "error",
      error: result.error.message,
    });
  }, []);

  useEffect(() => {
    void load(projectKey);
    // unmount / 依存変更時に世代 id を進め、解決済みでない in-flight 応答を
    // stale として破棄する（unmount 後の setState を防ぐ）。
    return () => {
      requestIdRef.current += 1;
    };
  }, [load, projectKey]);

  const reload = useCallback((): Promise<void> => {
    return load(projectKey);
  }, [load, projectKey]);

  const byName = useMemo(
    () => LabelDefinition.byName(state.labels),
    [state.labels],
  );

  return useMemo(
    () => ({
      labels: state.labels,
      usageCounts: state.usageCounts,
      byName,
      status: state.status,
      error: state.error,
      reload,
    }),
    [
      state.labels,
      state.usageCounts,
      byName,
      state.status,
      state.error,
      reload,
    ],
  );
};
