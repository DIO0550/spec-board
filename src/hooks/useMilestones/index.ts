import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Milestone } from "@/domains/milestone";
import { getMilestones, type MilestoneDefinition } from "@/lib/tauri";

/** マイルストーン定義リソースの取得状態。 */
export type MilestonesStatus = "idle" | "loading" | "loaded" | "error";

/**
 * 複数 feature（board / settings / detail / milestoneView）で共有する
 * マイルストーン定義リソース。getMilestones の唯一の取得点。
 */
export type MilestonesResource = {
  /** マイルストーン定義の配列（定義順）。idle / loading 中は空配列 */
  milestones: MilestoneDefinition[];
  /** マイルストーン名 → 使用タスク件数 */
  usageCounts: Record<string, number>;
  /** name → 定義の Map（TaskCard / DetailScreen が引く） */
  byName: Map<string, MilestoneDefinition>;
  /** 取得状態 */
  status: MilestonesStatus;
  /** error 状態時のメッセージ */
  error?: string;
  /** 設定 CRUD 成功後などに呼ぶ再取得関数 */
  reload: () => Promise<void>;
};

type ResourceState = {
  milestones: MilestoneDefinition[];
  usageCounts: Record<string, number>;
  status: MilestonesStatus;
  error?: string;
};

const IDLE_STATE: ResourceState = {
  milestones: [],
  usageCounts: {},
  status: "idle",
};

/**
 * プロジェクト単位のマイルストーン定義リソースを取得する feature 横断の共有フック。
 *
 * - projectKey が undefined（プロジェクト未オープン）のときは getMilestones を呼ばず idle。
 * - projectKey が変化したら再取得する（loading → loaded / error）。
 * - in-flight 中に projectKey が変わった場合、古い応答は stale として破棄する
 *   （最新 projectKey の応答のみ反映）。
 * - reload() は現在の projectKey で再取得する（設定 CRUD 後に呼ぶ）。
 *
 * @param projectKey - 現在開いているプロジェクトの識別子（未オープンは undefined）
 * @returns マイルストーン定義リソース
 */
export const useMilestones = (
  projectKey: string | undefined,
): MilestonesResource => {
  const [state, setState] = useState<ResourceState>(IDLE_STATE);
  // 各 load 呼び出しに採番する世代 id。最新世代の応答だけが state を確定する。
  // key 比較だけでは同一 projectKey の重複ロード（初回 + reload）で古い応答が
  // 後勝ちしてしまうため、key ではなく世代 id で stale 応答を破棄する。
  const requestIdRef = useRef(0);

  const load = useCallback(async (key: string | undefined): Promise<void> => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (key === undefined) {
      setState(IDLE_STATE);
      return;
    }
    // loading 開始時は前回値を残さずクリアする（projectKey 変更 / reload 時の stale 表示防止）。
    setState({ milestones: [], usageCounts: {}, status: "loading" });
    const result = await getMilestones();
    // この応答より後に開始された load があれば（key 同一でも）古い応答として捨てる。
    if (requestIdRef.current !== requestId) {
      return;
    }
    if (result.ok) {
      setState({
        milestones: result.value.milestones,
        usageCounts: result.value.usageCounts,
        status: "loaded",
      });
      return;
    }
    setState({
      milestones: [],
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

  // name → 定義の Map は milestones が変わらない限り同一参照を保ち、
  // 消費側（memo 化された子コンポーネント）の不要再レンダーを抑える。
  const byName = useMemo(
    () => Milestone.byName(state.milestones),
    [state.milestones],
  );

  // 戻り値オブジェクトも依存が変わらない限り同一参照を返し、
  // App 側の useMemo 連鎖が意図どおり効くようにする。
  return useMemo(
    () => ({
      milestones: state.milestones,
      usageCounts: state.usageCounts,
      byName,
      status: state.status,
      error: state.error,
      reload,
    }),
    [
      state.milestones,
      state.usageCounts,
      byName,
      state.status,
      state.error,
      reload,
    ],
  );
};
