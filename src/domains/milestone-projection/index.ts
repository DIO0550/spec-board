import type { TaskFilePath } from "@/domains/task-identity";

/** BE wire payload 1 milestone 分の入力型。 */
export type MilestoneProjectionPayloadInput = Readonly<{
  done: number;
  total: number;
  taskFilePaths: readonly string[];
}>;

/** milestone 名を key にした BE wire payload。 */
export type MilestoneProjectionsPayloadInput = Readonly<
  Record<string, MilestoneProjectionPayloadInput>
>;

/** 1 milestone 分の live progress と board-order task path。 */
export type MilestoneProjection = Readonly<{
  done: number;
  total: number;
  taskFilePaths: readonly TaskFilePath[];
}>;

/** raw milestone 名から projection を引く安全な domain Map。 */
export type MilestoneProjectionMap = ReadonlyMap<string, MilestoneProjection>;

const EMPTY: MilestoneProjection = Object.freeze({
  done: 0,
  total: 0,
  taskFilePaths: Object.freeze([]) as readonly TaskFilePath[],
});

const EMPTY_MAP: MilestoneProjectionMap = new Map();

export const MilestoneProjection = {
  /** 未取得状態で共有する固定参照の空 Map。 */
  emptyMap: EMPTY_MAP,

  /**
   * BE の raw object payload を任意文字列 key に安全な Map へ変換する。
   * @param payload - milestone 名を key にした raw payload
   * @returns milestone 名から projection を引く Map
   */
  fromPayload: (
    payload: MilestoneProjectionsPayloadInput,
  ): MilestoneProjectionMap =>
    new Map(
      Object.entries(payload).map(([name, value]) => [
        name,
        {
          done: value.done,
          total: value.total,
          taskFilePaths: value.taskFilePaths.map(
            (filePath) => filePath as TaskFilePath,
          ),
        },
      ]),
    ),

  /**
   * raw milestone 名に対応する projection を返す。
   * @param map - milestone projection Map
   * @param name - 正規化しない raw milestone 名
   * @returns 登録値、または共有 zero projection
   */
  findByName: (
    map: MilestoneProjectionMap,
    name: string,
  ): MilestoneProjection => map.get(name) ?? EMPTY,

  /**
   * 未使用 milestone 用の共有 zero projection を返す。
   * @returns freeze 済み zero projection
   */
  empty: (): MilestoneProjection => EMPTY,

  /**
   * 全 milestone projection の進捗を1回の走査で合計する。
   * @param map - 集計する milestone projection Map
   * @returns done と total の合計
   */
  sum: (
    map: MilestoneProjectionMap,
  ): Readonly<{ done: number; total: number }> => {
    let done = 0;
    let total = 0;
    for (const projection of map.values()) {
      done += projection.done;
      total += projection.total;
    }
    return { done, total };
  },

  /**
   * 2つの projection を path 順序込みで比較する。
   * @param left - 比較対象
   * @param right - 比較対象
   * @returns 全フィールドが一致する場合 true
   */
  equals: (left: MilestoneProjection, right: MilestoneProjection): boolean =>
    left.done === right.done &&
    left.total === right.total &&
    left.taskFilePaths.length === right.taskFilePaths.length &&
    left.taskFilePaths.every(
      (filePath, index) => filePath === right.taskFilePaths[index],
    ),
} as const;
