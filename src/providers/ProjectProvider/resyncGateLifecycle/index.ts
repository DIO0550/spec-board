import type { WatcherSession } from "@/domains/watcher-session";
import type { WatcherGateRef } from "../watcherEnvelopeGate";
import {
  WatcherGate,
  type WatcherSnapshotResult,
} from "../watcherEnvelopeGate";

/**
 * 1 本の resync 要求に対応する gate 遷移ハンドル。
 *
 * 呼び出し順は `start` → `issue` → `apply` で、`release` は必ず `finally` で
 * 1 回呼ぶ。`apply` に到達しなかった場合の後始末は `release` が引き受ける。
 */
export type ResyncGateLifecycle = {
  /**
   * 発行を宣言する。以後 IPC 応答まで、届いた envelope は buffer される。
   *
   * ここを通さずに `get_tasks` を投げると、応答待ちのあいだに届いた envelope が
   * 即時 apply されたあと、より古い snapshot で上書きされて変更が失われる。
   */
  readonly start: () => void;
  /**
   * IPC を投げる直前に未解決 latch を下ろす。**barrier の後に呼ぶこと**。
   *
   * barrier の前に呼ぶと、待機中に診断が露呈した欠番まで「この再取得より前の
   * 債務」として消してしまう。実際には barrier の後に投げる snapshot がその
   * 欠落も含むため、下ろす境界は発行の瞬間だけが正しい。
   */
  readonly issue: () => void;
  /**
   * snapshot を適用する。
   * @param session 応答が持つ session
   * @returns 採用できた場合は畳み込み結果、できなければ null
   */
  readonly apply: (session: WatcherSession) => WatcherSnapshotResult | null;
  /**
   * 出口。`apply` が成功していなければ `resyncFailed` を通す。
   *
   * これを通さないと `status` が `resyncing` のまま残り、以後の envelope が
   * すべて buffer 行に落ちて board が恒久フリーズする。
   * gate が既に別 session のものへ差し替わっている場合は何もしない
   * （触ると新 session の buffer を壊す）。
   */
  readonly release: () => void;
};

/** ResyncGateLifecycle の companion API。 */
export const ResyncGateLifecycle = {
  /**
   * 要求 1 本ぶんのハンドルを作る。
   * @param gate Provider が保持する gate ref
   * @param generation 発行時点の watcher generation
   * @returns 遷移ハンドル
   */
  forRequest: (
    gate: WatcherGateRef,
    generation: number,
  ): ResyncGateLifecycle => {
    let applied: WatcherSnapshotResult | null = null;
    /**
     * gate が今も自分の発行した世代のものかを返す。
     * @returns 自世代なら true
     */
    const ownsGate = (): boolean =>
      gate.current.session?.generation === generation;
    return {
      /** {@link ResyncGateLifecycle.start} */
      start: (): void => {
        gate.current = WatcherGate.resyncStarted(gate.current);
      },
      /** {@link ResyncGateLifecycle.issue} */
      issue: (): void => {
        gate.current = WatcherGate.resyncIssued(gate.current);
      },
      /**
       * {@link ResyncGateLifecycle.apply}
       * @param session 応答が持つ session
       * @returns 採用できた場合は畳み込み結果、できなければ null
       */
      apply: (session: WatcherSession): WatcherSnapshotResult | null => {
        const result = WatcherGate.snapshotApplied(gate.current, session);
        if (!result.accepted) {
          return null;
        }
        applied = result;
        gate.current = result.state;
        return result;
      },
      /** {@link ResyncGateLifecycle.release} */
      release: (): void => {
        if (applied !== null) {
          return;
        }
        if (!ownsGate()) {
          return;
        }
        gate.current = WatcherGate.resyncFailed(gate.current);
      },
    };
  },
} as const;
