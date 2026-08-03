/**
 * `TaskForest.fromPayload` が受け取る 1 ノード分の raw 入力。
 * IPC 層の型を import せず domain 側に構造型を置き、依存を IPC → domain の
 * 一方向に保つ（`TaskProjection` / `Task.fromPayload` と同じ形）。
 */
export type TaskTreeNodePayloadInput = {
  readonly filePath: string;
  readonly children: readonly TaskTreeNodePayloadInput[];
};

/** root ノード列の raw 入力。 */
export type TaskForestPayloadInput = readonly TaskTreeNodePayloadInput[];

/**
 * タスク階層ツリーの 1 ノード。
 * `depth` は持たない（ネスト構造から自明。描画側が親から depth + 1 を渡す）。
 */
export type TaskTreeNode = {
  /** BE が解決した raw な filePath（`Task.filePath` と同じ基準。正規化しない） */
  readonly filePath: string;
  /** 直接の子（board 表示順） */
  readonly children: readonly TaskTreeNode[];
};

/** root ノード列。board 表示順（循環救済ノードも board 順の自分の位置に入る）。 */
export type TaskForest = readonly TaskTreeNode[];

/** tree 未取得時の空 forest（固定参照。useMemo の miss を防ぐ）。 */
const EMPTY_FOREST: TaskForest = [];

/**
 * 2 つの forest が構造・順序ともに同一かを判定する。
 *
 * `src/types/task.ts` の `deepEquals`（汎用 JSON deep-equal）でも正しい結果になるが、
 * 既存 domain の `equals` は型付き直書きが流儀で、`deepEquals` は `Task.extras`
 * （任意 JSON）のための例外。フィールドを直接比較することで、フィールドが増えたときに
 * 比較漏れがコンパイルで見える。
 *
 * 比較は **index を揃えた位置一致**。集合一致にすると「filePath 集合は同じで board 順
 * だけ変わった」更新を検出できず、順序が変わったのに旧 forest 参照を返してしまう。
 *
 * 走査は明示 stack の反復。BE の `project_forest` は 10,000 段を通す契約なので、
 * ここだけ再帰にすると FE が先に `RangeError` で落ちる。
 *
 * この比較は本ファイルに閉じ、汎用ヘルパーとして export しない
 * （`arrayShallowEq` / `sameFilePaths` に続く 3 本目の配列比較を作らないため）。
 * @param left - 比較対象
 * @param right - 比較対象
 * @returns 同じ位置に同じ filePath が並び、children も再帰的に一致すれば true
 */
const forestEquals = (left: TaskForest, right: TaskForest): boolean => {
  const pending: [readonly TaskTreeNode[], readonly TaskTreeNode[]][] = [
    [left, right],
  ];
  for (;;) {
    const pair = pending.pop();
    if (pair === undefined) {
      return true;
    }
    const [leftLevel, rightLevel] = pair;
    if (leftLevel === rightLevel) {
      continue;
    }
    if (leftLevel.length !== rightLevel.length) {
      return false;
    }
    for (let index = 0; index < leftLevel.length; index += 1) {
      const leftNode = leftLevel[index];
      const rightNode = rightLevel[index];
      if (leftNode === rightNode) {
        continue;
      }
      if (leftNode.filePath !== rightNode.filePath) {
        return false;
      }
      pending.push([leftNode.children, rightNode.children]);
    }
  }
};

/** `prune` の組み立て途中ノード。children を後から差し替えるため可変で持つ。 */
type PrunedNode = {
  readonly filePath: string;
  children: PrunedNode[];
};

/**
 * forest から「子 filePath → 親 filePath」の辺だけを取り出す。
 *
 * root（親を持たないノード）は登録しない。`prune` の分岐では「tree に不在」と
 * 「tree 上の正準 root」がどちらも ROOT に落ちるため、両者を区別する必要がない。
 *
 * 同じ filePath が複数回現れる payload（BE では作られない）でも辺は先勝ちで確定させ、
 * 一度辿ったノードの配下へは再突入しない。走査は明示 stack の反復。
 * @param forest - BE 由来の正準ツリー
 * @returns 子 filePath -> 親 filePath の Map
 */
const buildParentByFilePath = (forest: TaskForest): Map<string, string> => {
  const parentByFilePath = new Map<string, string>();
  const visited = new Set<string>();
  const stack: TaskTreeNode[] = [...forest].reverse();
  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    stack.pop();
    if (visited.has(current.filePath)) {
      continue;
    }
    visited.add(current.filePath);
    for (let index = current.children.length - 1; index >= 0; index -= 1) {
      const child = current.children[index];
      if (!parentByFilePath.has(child.filePath)) {
        parentByFilePath.set(child.filePath, current.filePath);
      }
      stack.push(child);
    }
  }
  return parentByFilePath;
};

/**
 * `roots` から辿り着けるノードの filePath を `reachable` へ広げる。
 * @param start - 走査の起点ノード
 * @param reachable - 到達済み filePath の集合（この関数が書き加える）
 */
const markReachable = (start: PrunedNode, reachable: Set<string>): void => {
  const stack: PrunedNode[] = [start];
  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    stack.pop();
    if (reachable.has(current.filePath)) {
      continue;
    }
    reachable.add(current.filePath);
    stack.push(...current.children);
  }
};

export const TaskForest = {
  /** tree 未取得時に返す固定参照。 */
  empty: EMPTY_FOREST,

  /**
   * IPC の raw payload を domain 表現へ写す。
   *
   * `TaskTreeNodePayloadInput` と `TaskTreeNode` は構造的に同一なので、再帰的な
   * 組み直しは行わず payload の参照をそのまま採用する（`TaskProjection.fromPayload`
   * が `childFilePaths` を素通ししているのと同じ先例）。再構築すると `get_tasks` の
   * たびに全ノードを新規割り当てし、直後に `merge` が旧参照へ戻すことになる。
   * 代入可能性は構造的部分型で保証されるため型アサーション（`as`）は使わない。
   *
   * 素通しでも変換関数として残すのは、将来 BE の payload 形状が domain と乖離した
   * ときの単一の変換点にするため（他 domain と codec の呼び出し形も揃う）。
   * @param payload - BE から受け取った taskTree
   * @returns domain 表現の forest
   */
  fromPayload: (payload: TaskForestPayloadInput): TaskForest => payload,

  /**
   * 2 つの forest が構造・順序ともに同一かを判定する。
   * @param left - 比較対象
   * @param right - 比較対象
   * @returns 位置まで含めて一致すれば true
   */
  equals: (left: TaskForest, right: TaskForest): boolean =>
    forestEquals(left, right),

  /**
   * 新旧 forest をマージする。**全体が構造等価なら `prev` をそのまま返し、
   * 違えば `next` を返す**（部分木単位の参照引き継ぎはしない）。
   *
   * 目的は「`get_tasks` 再同期のたびに `taskTree` の参照が変わり、TreeView の
   * `useMemo(() => TaskForest.prune(...), [taskTree, ...])` が毎回再計算される」ことの
   * 抑止。部分木単位で参照を保存しないのは、唯一の消費者である `prune` が出力ノードを
   * 新規生成するため、部分木の参照保存が消費者まで届かないから。実装と契約を重くする
   * だけで効果がない。
   *
   * 「集合は同じで並び順だけ変わった」更新も、`equals` が位置依存なのでここで検出される。
   * @param prev - 直前の forest
   * @param next - 新しく受け取った forest
   * @returns 構造等価なら `prev`、違えば `next`
   */
  merge: (prev: TaskForest, next: TaskForest): TaskForest =>
    forestEquals(prev, next) ? prev : next,

  /**
   * 可視 filePath 集合でツリーを枝刈りする。
   *
   * 実装は削除した `features/board/lib/buildTaskTree` の移植で、現行の 4 終端
   * （親配下の子 / 親が不可視で root 昇格 / 正準 root / tree 未収載の fallback）を
   * そのまま保つ。変わるのは親の取得元（`Task.hierarchy.parentFilePath` の FE 正規化 →
   * BE が解決済みの tree 由来 `parentByFilePath`）と fallback の意味（循環救済 →
   * stale tree の吸収）だけ。BE tree を親の真実源にするのは、FE / BE で path 正規化の
   * 実装が食い違っており（FE は任意位置のコロン終端セグメントを落とすが BE は先頭 1 文字
   * + `:` のみ）、親子解決の規則を BE の 1 実装に確定させることが移管の目的だから。
   *
   * **契約**: 出力に現れるノード集合は `visibleFilePaths` と過不足なく一致する。
   * - 可視ノードの親が不可視なら root へ昇格させる（最近祖先へは再接続しない）
   * - forest に存在しない可視 filePath も root として出す。optimistic 更新直後は
   *   `taskTree` が stale（`projections` と同じ）なので、この fallback がないと
   *   新規作成タスクが次の `get_tasks` までツリーから消える
   * - root 列・children 列とも `visibleFilePaths` の順（= board 表示順）。tree 由来の
   *   children 順ではなく走査順を採るのは `taskTree` が stale になりうるためで、
   *   tree が fresh な通常時は BE の children 順と一致する
   *
   * 4 フェーズに分けるのは、可視集合の中で子が親より前に来ることがあるから
   * （別カラムの子は board 順で親より前に並びうる）。走査しながら親へ append する
   * 1 パス実装だと「親ノードがまだ無い」ケースで子が落ちる。
   *
   * 全件可視で構造も変わらない場合は入力 forest をそのまま返す。「全件可視なら
   * 常に入力を返す」という素朴な fast path は採れない（stale tree では可視列の順が
   * tree の順と食い違い、最新の board 順を返せなくなる）。
   * @param forest - BE 由来の全タスク正準ツリー
   * @param visibleFilePaths - 表示対象タスクの filePath（board 表示順）
   * @returns 可視集合と 1:1 に対応する forest
   */
  prune: (
    forest: TaskForest,
    visibleFilePaths: readonly string[],
  ): TaskForest => {
    const parentByFilePath = buildParentByFilePath(forest);

    // Map の反復順 = 挿入順 = board 順。以降のフェーズはこの順で走査するので、
    // 別に順序配列を持たなくても root 列・children 列が board 順に揃う。
    const nodeByFilePath = new Map<string, PrunedNode>();
    for (const filePath of visibleFilePaths) {
      if (nodeByFilePath.has(filePath)) {
        continue;
      }
      nodeByFilePath.set(filePath, { filePath, children: [] });
    }

    /**
     * tree 由来の親が可視集合にも居る場合だけ、その出力ノードを返す。
     * @param filePath - 親を引きたいノードの filePath
     * @returns 可視な親ノード。tree に親が無い / 親が不可視なら `undefined`
     */
    const parentNodeOf = (filePath: string): PrunedNode | undefined => {
      const parentFilePath = parentByFilePath.get(filePath);
      if (parentFilePath === undefined) {
        return undefined;
      }
      return nodeByFilePath.get(parentFilePath);
    };

    const roots: PrunedNode[] = [];
    for (const [filePath, current] of nodeByFilePath) {
      const parent = parentNodeOf(filePath);
      if (parent === undefined) {
        roots.push(current);
        continue;
      }
      parent.children.push(current);
    }

    // 壊れた payload（親が相互参照）では、どの root からも辿れないノードが残る。
    // 親の children から外してから root へ足すことで、出力が必ず有限の森になる。
    // 外さずに root へ足すだけだと相互参照が残り、描画側が無限に再帰する。
    const reachable = new Set<string>();
    for (const root of roots) {
      markReachable(root, reachable);
    }
    for (const [filePath, current] of nodeByFilePath) {
      if (reachable.has(filePath)) {
        continue;
      }
      const parent = parentNodeOf(filePath);
      if (parent !== undefined) {
        parent.children = parent.children.filter((child) => child !== current);
      }
      roots.push(current);
      markReachable(current, reachable);
    }

    return forestEquals(forest, roots) ? forest : roots;
  },
} as const;
