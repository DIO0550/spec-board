import type { Task } from "@/domains/task";

/**
 * 移動先カラムの新しい filePaths を生成する純粋関数。
 *
 * 手順:
 * 1. tasks から `toColumn` に属するタスクを抽出し、現状 filePaths を取得
 * 2. 同一カラム内（fromColumn === toColumn）かつ元 index &lt; toIndex のとき、
 *    toIndex を 1 減らす。hover index は target を含む DOM から計算されるため、
 *    target 除外後の配列に適用する際 1 ズレる。カラム間移動では target は
 *    toColumn の DOM に含まれていなかったので補正しない。
 * 3. 移動対象 (`taskFilePath`) が含まれていれば一度除外（同一カラム内移動の重複排除）
 * 4. 補正済み toIndex を `[0, withoutTarget.length]` に clamp
 * 5. clamp 済み位置に `taskFilePath` を挿入
 * 6. 結果を返す（移動後の toColumn 内 filePaths）
 *
 * @param tasks 現在の全 task
 * @param taskFilePath 移動対象 task の filePath
 * @param fromColumn 元カラム名（hover index 補正の判断に使用）
 * @param toColumn 移動先カラム名
 * @param toIndex hover 計算で得られた挿入位置（target を含む DOM 位置基準）
 * @returns 移動先カラムの新 filePaths（toColumn に属するタスクの並び順）
 */
export const buildMovedFilePaths = (
  tasks: readonly Task[],
  taskFilePath: string,
  fromColumn: string,
  toColumn: string,
  toIndex: number,
): string[] => {
  const filePathsInColumn = tasks
    .filter((t) => t.status === toColumn)
    .map((t) => t.filePath);
  const originalIndex = filePathsInColumn.indexOf(taskFilePath);
  const sameColumnDownward =
    fromColumn === toColumn && originalIndex !== -1 && originalIndex < toIndex;
  const adjustedIndex = sameColumnDownward ? toIndex - 1 : toIndex;
  const withoutTarget = filePathsInColumn.filter((p) => p !== taskFilePath);
  const clamped = Math.max(0, Math.min(adjustedIndex, withoutTarget.length));
  return [
    ...withoutTarget.slice(0, clamped),
    taskFilePath,
    ...withoutTarget.slice(clamped),
  ];
};
