import { useRef } from "react";
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
 * render 中に ref を書き換えるが、これは「同じ入力に対して同じ出力を返す」ための
 * キャッシュであり render を純粋に保つ（同一 render 内で 2 回呼んでも結果は同じ）。
 * `useMemo` では依存に配列参照そのものを置くしかなく目的を果たせない。
 * @param tasks - 毎 render 新しくなりうる Task 配列
 * @returns 内容が変わらない限り同一の配列参照
 */
export const useStableTaskList = (tasks: readonly Task[]): readonly Task[] => {
  const ref = useRef<readonly Task[]>(tasks);
  const previous = ref.current;
  const same =
    previous.length === tasks.length &&
    previous.every((task, index) => task === tasks[index]);
  if (!same) {
    ref.current = tasks;
  }
  return ref.current;
};
