import { useEffect, useRef } from "react";
import type { Task } from "@/types/task";

/**
 * 内容（要素の参照列）が前回と同じなら、前回の配列インスタンスをそのまま返す。
 *
 * `Column/index.tsx` は `task.hierarchy.childFilePaths.map(card.byPath).filter(...)`
 * を render ごとに新しい配列として作るため、そのまま `useMemo` の依存に置くと
 * 子を持つ全カードで memo が毎 render 落ちる。要素（Task オブジェクト）は
 * `allTasks` 由来で、tasks が変わらない限り参照が安定しているので、
 * 要素単位の `===` 比較で「内容が同じ」を判定できる。
 *
 * `Column` 側で memo 化するには per-task の子コンポーネント抽出が必要で、
 * 本 spec と無関係な構造変更になるため、消費側の Root で吸収する。
 *
 * キャッシュの更新は render 中ではなく commit 後に行う。concurrent rendering では
 * 破棄される render がありうるため、render 中に ref を書き換えるとその値が次の
 * commit へ混入する。render 中は ref を読むだけにし、確定した値を effect で書き戻す。
 *
 * `useMemo` では依存に配列参照そのものを置くしかなく、目的を果たせない。
 * @param tasks - 毎 render 新しくなりうる Task 配列
 * @returns 内容が変わらない限り同一の配列参照
 */
export const useStableTaskList = (tasks: readonly Task[]): readonly Task[] => {
  const ref = useRef<readonly Task[]>(tasks);
  const previous = ref.current;
  const same =
    previous.length === tasks.length &&
    previous.every((task, index) => task === tasks[index]);
  const stable = same ? previous : tasks;

  useEffect(() => {
    ref.current = stable;
  });

  return stable;
};
