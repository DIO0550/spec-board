import type { Task } from "@/types/task";

/**
 * 移動先カラムの新しい filePaths を生成する純粋関数。
 *
 * 手順:
 * 1. tasks から `toColumn` に属するタスクを抽出し、現状 filePaths を取得
 * 2. 移動対象 (`taskFilePath`) が含まれていれば一度除外（同一カラム内移動の重複排除）
 * 3. `toIndex` を `[0, withoutTarget.length]` に clamp
 * 4. clamp 済み位置に `taskFilePath` を挿入
 * 5. 結果を返す（移動後の toColumn 内 filePaths）
 *
 * @param tasks 現在の全 task
 * @param taskFilePath 移動対象 task の filePath
 * @param toColumn 移動先カラム名
 * @param toIndex hover 計算で得られた挿入位置
 * @returns 移動先カラムの新 filePaths（toColumn に属するタスクの並び順）
 */
export const buildMovedFilePaths = (
  tasks: readonly Task[],
  taskFilePath: string,
  toColumn: string,
  toIndex: number,
): string[] => {
  const filePathsInColumn = tasks
    .filter((t) => t.status === toColumn)
    .map((t) => t.filePath);
  const withoutTarget = filePathsInColumn.filter((p) => p !== taskFilePath);
  const clamped = Math.max(0, Math.min(toIndex, withoutTarget.length));
  return [
    ...withoutTarget.slice(0, clamped),
    taskFilePath,
    ...withoutTarget.slice(clamped),
  ];
};
