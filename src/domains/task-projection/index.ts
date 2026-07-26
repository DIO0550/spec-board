/**
 * `TaskProjection.fromPayload` が受け取る 1 件分の raw 入力。
 *
 * IPC 層の型を import せず domain 側に構造型を置くことで、依存を
 * IPC → domain の一方向に保つ（`Task.fromPayload` と同じ形）。
 */
export type TaskProjectionPayloadInput = {
  readonly subIssueProgress: { readonly done: number; readonly total: number };
  readonly isDone: boolean;
  readonly childFilePaths: readonly string[];
};

/** filePath をキーにした raw 入力。IPC 層はこの型に適合する payload を渡すだけでよい。 */
export type TaskProjectionsPayloadInput = Readonly<
  Record<string, TaskProjectionPayloadInput>
>;

/** 子孫タスクの完了数 / 総数。`TaskProjection.subIssueProgress` の形。 */
export type SubIssueCounts = {
  /** 完了している件数 */
  readonly done: number;
  /** 集計対象の総数 */
  readonly total: number;
};

/** 1 タスク分の projection（BE `TaskIndex::project_all` の出力）。 */
export type TaskProjection = {
  /** 全子孫（root 自身は含まない）の完了数 / 総数 */
  readonly subIssueProgress: SubIssueCounts;
  /** このタスク自身が完了カラムに居るか */
  readonly isDone: boolean;
  /** 直接の子のうち実在する task の filePath（`filePath` 昇順） */
  readonly childFilePaths: readonly string[];
};

/**
 * filePath -> projection。IPC の raw object から `Map` へ写して保持する。
 *
 * キーは BE が返した **raw な `filePath`**。`@/domains/broken-link` の
 * `buildTasksByNormalizedPath` は `normalizeTaskPathForLookup` 済みの正規化 path を
 * キーにするため、同じ filePath キー Map でも基準が異なる。取り違えると無言で
 * lookup が外れるので、引き当ては `findByFilePath` を使う。
 *
 * raw payload は `Record`・domain 保持は `Map` という非対称は、既存 IPC 型の慣習
 * （`labelCommands/types.ts` の `usageCounts: Record<string, number>`）と
 * `label-registry` のプロトタイプ汚染配慮の折衷。
 */
export type TaskProjectionMap = ReadonlyMap<string, TaskProjection>;

/**
 * projection 未登録 filePath 用の固定参照。
 *
 * 未登録のたびに新しいオブジェクトを返すと、参照を依存に取る `useMemo` が毎回 miss
 * するため固定参照を共有する（実体は freeze されていないが、呼出元は読み取りのみで
 * 使う前提。`EMPTY_BROKEN_LINK_SET` と同じ扱い）。
 */
const EMPTY_PROJECTION: TaskProjection = {
  subIssueProgress: { done: 0, total: 0 },
  isDone: false,
  childFilePaths: [],
};

/** projection 未取得時の空 Map（`EMPTY_PROJECTION` と同じ理由で固定参照）。 */
const EMPTY_MAP: TaskProjectionMap = new Map();

export const TaskProjection = {
  /** projection 未登録時に返す固定参照。 */
  empty: EMPTY_PROJECTION,

  /** projection 未取得時の空 Map（固定参照）。 */
  emptyMap: EMPTY_MAP,

  /**
   * IPC の raw payload（filePath をキーにしたオブジェクト）を Map へ変換する。
   *
   * `filePath` はユーザー由来の任意文字列のため、プロトタイプ汚染を避けて Map で保持する。
   * BE の payload 契約を信頼して素通しし、欠損フィールドへの防御は入れない
   * （fixture 漏れを隠さないため）。
   * @param payload - BE から受け取った projections オブジェクト
   * @returns raw filePath -> projection の Map
   */
  fromPayload: (payload: TaskProjectionsPayloadInput): TaskProjectionMap => {
    const map = new Map<string, TaskProjection>();
    for (const [filePath, projection] of Object.entries(payload)) {
      map.set(filePath, {
        subIssueProgress: {
          done: projection.subIssueProgress.done,
          total: projection.subIssueProgress.total,
        },
        isDone: projection.isDone,
        childFilePaths: projection.childFilePaths,
      });
    }
    return map;
  },

  /**
   * raw filePath に対応する projection を引く。未登録なら固定参照 {@link TaskProjection.empty}
   * を返し、同一 filePath に対して常に同一参照になることを保証する。
   *
   * 正規化 path をキーにする `@/domains/broken-link` の lookup と取り違えないよう、
   * キーの基準を名前に含める。
   * @param map - projection map
   * @param filePath - 引き当てる raw filePath（正規化しない）
   * @returns 該当 projection、なければ `TaskProjection.empty`
   */
  findByFilePath: (map: TaskProjectionMap, filePath: string): TaskProjection =>
    map.get(filePath) ?? EMPTY_PROJECTION,

  /**
   * 2 つの projection が同じ内容かを判定する。
   *
   * 再同期のたびに全カードの `useMemo` が miss するのを防ぐため、`replaceProjections` の
   * マージで「内容が変わっていないエントリは旧参照を引き継ぐ」判定に使う。
   * @param left - 比較対象
   * @param right - 比較対象
   * @returns 4 フィールドすべて一致すれば true
   */
  equals: (
    left: TaskProjection | undefined,
    right: TaskProjection | undefined,
  ): boolean => {
    if (left === right) {
      return true;
    }
    if (left === undefined || right === undefined) {
      return false;
    }
    return (
      left.subIssueProgress.done === right.subIssueProgress.done &&
      left.subIssueProgress.total === right.subIssueProgress.total &&
      left.isDone === right.isDone &&
      left.childFilePaths.length === right.childFilePaths.length &&
      left.childFilePaths.every(
        (filePath, index) => filePath === right.childFilePaths[index],
      )
    );
  },

  /**
   * sub-issue 進捗率（0-100、`Math.round`。総数 0 のときは 0）を返す。
   *
   * 百分率は IPC 契約に含めず、この 1 実装を `SubIssueProgress`（board）と
   * `SubIssueSection`（detail）が共有する。本文 checkbox の完了率
   * （`@/components/BodyTaskProgress`）と milestone の ratio 表示
   * （`MilestoneProgressBar`）は別概念のためここに統合しない。
   * @param counts - 完了数 / 総数
   * @returns 進捗率
   */
  percentage: (counts: SubIssueCounts): number => {
    if (counts.total === 0) {
      return 0;
    }
    return Math.round((counts.done / counts.total) * 100);
  },
} as const;
