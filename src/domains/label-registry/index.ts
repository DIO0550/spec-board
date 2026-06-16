import type { Task } from "@/types/task";

/**
 * ラベルのグループ。標準 4 種 + その他 prefix（任意文字列）+ prefix 無し用 "default"。
 * 標準グループは型で固定し、その他は string として受ける。
 */
export type StandardLabelGroup = "type" | "priority" | "area" | "status";
export type LabelGroup = StandardLabelGroup | "default" | (string & {});

/**
 * 1 グループに割り当てる oklch カラートークン群（light テーマ値）。
 * 将来ダーク対応時は LIGHT_PALETTE と並べて DARK_PALETTE を追加し、
 * ColorTokens を { light, dark } に内包する拡張余地を残す命名とする。
 */
export type ColorTokens = {
  /** 前景（文字色） oklch */
  readonly fg: string;
  /** 背景色 oklch */
  readonly bg: string;
  /** 境界線色 oklch */
  readonly bd: string;
  /** 小丸インジケータ色 oklch */
  readonly dot: string;
};

/**
 * 10 色 light パレット（index 0..9）。各色 fg/bg/bd/dot の 4 トークンを持つ。
 * index 0..4 = 固定枠（default + 標準 4 群）、index 5..9 = 動的枠（その他 prefix 用）。
 * fg と bg は light 背景で WCAG AA 相当（コントラスト比 4.5:1 を目安）を満たすよう選定。
 */
const LIGHT_PALETTE: readonly ColorTokens[] = [
  // --- 固定枠 (0..4) ---
  // 0: slate（default 群）
  {
    fg: "oklch(0.38 0.02 250)",
    bg: "oklch(0.96 0.005 250)",
    bd: "oklch(0.88 0.01 250)",
    dot: "oklch(0.62 0.03 250)",
  },
  // 1: blue（type 群）
  {
    fg: "oklch(0.42 0.13 250)",
    bg: "oklch(0.96 0.03 250)",
    bd: "oklch(0.86 0.07 250)",
    dot: "oklch(0.60 0.16 250)",
  },
  // 2: amber（priority 群）
  {
    fg: "oklch(0.45 0.12 75)",
    bg: "oklch(0.96 0.04 85)",
    bd: "oklch(0.87 0.09 85)",
    dot: "oklch(0.72 0.16 75)",
  },
  // 3: green（area 群）
  {
    fg: "oklch(0.42 0.11 150)",
    bg: "oklch(0.96 0.03 150)",
    bd: "oklch(0.86 0.08 150)",
    dot: "oklch(0.62 0.15 150)",
  },
  // 4: violet（status 群）
  {
    fg: "oklch(0.44 0.15 300)",
    bg: "oklch(0.96 0.03 300)",
    bd: "oklch(0.87 0.07 300)",
    dot: "oklch(0.58 0.18 300)",
  },
  // --- 動的枠 (5..9): その他 prefix を安定ハッシュで割当 ---
  // 5: rose
  {
    fg: "oklch(0.45 0.16 15)",
    bg: "oklch(0.96 0.03 15)",
    bd: "oklch(0.87 0.08 15)",
    dot: "oklch(0.62 0.20 15)",
  },
  // 6: cyan
  {
    fg: "oklch(0.42 0.10 220)",
    bg: "oklch(0.96 0.03 220)",
    bd: "oklch(0.86 0.07 220)",
    dot: "oklch(0.62 0.13 220)",
  },
  // 7: orange
  {
    fg: "oklch(0.46 0.14 50)",
    bg: "oklch(0.96 0.04 55)",
    bd: "oklch(0.87 0.09 55)",
    dot: "oklch(0.66 0.17 50)",
  },
  // 8: teal
  {
    fg: "oklch(0.42 0.09 185)",
    bg: "oklch(0.96 0.03 185)",
    bd: "oklch(0.86 0.06 185)",
    dot: "oklch(0.60 0.12 185)",
  },
  // 9: fuchsia
  {
    fg: "oklch(0.46 0.18 330)",
    bg: "oklch(0.96 0.04 330)",
    bd: "oklch(0.87 0.09 330)",
    dot: "oklch(0.60 0.22 330)",
  },
] as const;

/** 固定割当: グループ名 → palette index（default + 標準 4 のみ、index 0..4）。 */
const FIXED_GROUP_INDEX: Readonly<
  Record<StandardLabelGroup | "default", number>
> = {
  default: 0,
  type: 1,
  priority: 2,
  area: 3,
  status: 4,
} as const;

/** 動的枠（その他 prefix）の palette index 開始位置。固定枠 0..4 と排他にする。 */
const DYNAMIC_OFFSET = 5;
/** 動的枠のサイズ（index 5..9 の 5 色）。 */
const DYNAMIC_SIZE = LIGHT_PALETTE.length - DYNAMIC_OFFSET;

/**
 * グループ名から決定的なオフセット（0..size-1）を導出する安定ハッシュ。
 * 同名グループは常に同じ値（衝突しても順送りせず同一に固定）。
 *
 * アルゴリズムは以下に固定する（実装者依存をなくす。変更すると
 * prefix → index の対応が変わり golden test が落ちる）:
 *   - hash = 0 から開始
 *   - 各文字の UTF-16 code unit（charCodeAt(i)）を hash = (hash * 31 + code) | 0 で畳み込む
 *   - Math.abs(hash) % size を返す
 *
 * @param group - グループ名（正規化済み）
 * @param size - 動的枠のサイズ（DYNAMIC_SIZE）
 * @returns 0..size-1 のオフセット（呼び出し側で DYNAMIC_OFFSET を加算する）
 */
const stableHashIndex = (group: string, size: number): number => {
  let hash = 0;
  for (let i = 0; i < group.length; i++) {
    hash = (hash * 31 + group.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % size;
};

/**
 * ラベルレジストリ companion。prefix 基準でグループ判定し、グループ固定色を返す。
 * すべて純粋・同期・throw しない（計算量はラベル/グループ長に対して O(n)、
 * 短いラベル前提で実用上は定数時間）。同一グループは常に同一参照を返す。
 */
export const LabelRegistry = {
  /** 10 色 light パレット（index 0..4 固定枠 / 5..9 動的枠）。 */
  PALETTE: LIGHT_PALETTE,

  /**
   * ラベル文字列をグループに正規化する。
   * toLowerCase + 最初の ":" までを prefix として採用し、prefix 部も trim する。
   * 空文字 / prefix 無し / prefix が空（先頭 ":" や空白のみの prefix）はすべて "default"。
   * "a:b:c" は "a"。"type :feature" は "type"。throw しない。
   * @param label - 任意のラベル文字列
   * @returns 判定された LabelGroup（フォールバックは "default"）
   */
  parseGroup: (label: string): LabelGroup => {
    const trimmed = label.trim().toLowerCase();
    if (trimmed === "") {
      return "default";
    }
    const colon = trimmed.indexOf(":");
    if (colon <= 0) {
      return "default";
    }
    const prefix = trimmed.slice(0, colon).trim();
    return prefix === "" ? "default" : prefix;
  },

  /**
   * グループに対応するカラートークンを返す。
   * default + 標準 4 は固定枠（index 0..4）、その他 prefix は動的枠（index 5..9）へ
   * 安定ハッシュで決定的に写像する。固定枠と動的枠は排他で、その他 prefix が
   * default/標準群と同色になることはない。
   * 引数は内部で trim().toLowerCase() 正規化するため、tokensForGroup("Type") /
   * tokensForGroup(" type ") も "type" 群に一致し、空文字・空白は default になる。
   * @param group - LabelGroup（未正規化でも可。内部で正規化する）
   * @returns ColorTokens（同一グループは常に同一参照を返す）
   */
  tokensForGroup: (group: LabelGroup): ColorTokens => {
    const normalized = group.trim().toLowerCase();
    if (normalized === "") {
      return LIGHT_PALETTE[FIXED_GROUP_INDEX.default];
    }
    // Object.prototype 由来の名前（"constructor" / "__proto__" 等）を固定枠と
    // 誤認しないよう、値が number の自前プロパティのみを固定割当として採用する
    // （継承プロパティは function / object 等で number にならない）。
    const candidate = (FIXED_GROUP_INDEX as Record<string, unknown>)[
      normalized
    ];
    const fixed = typeof candidate === "number" ? candidate : undefined;
    const index =
      fixed ?? DYNAMIC_OFFSET + stableHashIndex(normalized, DYNAMIC_SIZE);
    return LIGHT_PALETTE[index];
  },

  /**
   * ラベル文字列から直接カラートークンを解決する（parseGroup → tokensForGroup の合成）。
   * @param label - 任意のラベル文字列
   * @returns ColorTokens
   */
  tokensForLabel: (label: string): ColorTokens => {
    return LabelRegistry.tokensForGroup(LabelRegistry.parseGroup(label));
  },

  /**
   * ラベル定義 1 件から「表示・集計・スワッチ解決で使うグループ名」を 1 つに決める。
   * `group` が定義済みかつ非空文字ならそれを採用、未定義 / 空文字 / 空白のみは
   * `parseGroup(label.name)` で name の prefix から導出する。
   *
   * この関数はラベル UI 全体（テーブルのグループ badge、フッター/ヘッダーの集計、
   * フォームのスワッチ、フィルタの絞り込み）が「同じ LabelDefinition を渡したら同じ
   * グループ名が返る」契約を保証するため、複数モジュールから参照する単一の真実源として
   * 使う（`displayGroup` / `groupOf` の重複実装を避ける）。
   * @param label - ラベル定義
   * @returns 表示・集計に使うグループ名
   */
  effectiveGroup: (label: { name: string; group?: string }): string => {
    const group = label.group?.trim() ?? "";
    if (group !== "") {
      return group;
    }
    return LabelRegistry.parseGroup(label.name);
  },

  /**
   * 現在のタスク集合からラベル名ごとの使用数を算出する（`Milestone.usageCounts` と対称）。
   * BE `TaskIndex::label_usage_counts` と同セマンティクス: タスク内の重複ラベルは 1 件に排除し、
   * 空文字ラベルは数えない。BE のスナップショットと異なり live なタスク集合から毎回計算する。
   * @param tasks - 現在のタスク一覧（各 task は `labels: string[]` を持つ）
   * @returns ラベル名 → 使用タスク件数
   */
  labelUsageCounts: (tasks: readonly Task[]): Record<string, number> => {
    // accumulator は Map にする。frontmatter のラベルは任意文字列のため、
    // `__proto__` / `constructor` のような prototype キーが来ても継承プロパティと
    // 衝突せず正しく数えるため。最終的に Object.fromEntries で公開形へ変換する
    // （`Object.fromEntries` は __proto__ も own property として設定する）。
    const counts = new Map<string, number>();
    for (const task of tasks) {
      // タスク内重複を排除（同名ラベル複数記載でも 1 件として数える）。
      const seen = new Set<string>();
      for (const label of task.labels) {
        if (label === "" || seen.has(label)) {
          continue;
        }
        seen.add(label);
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
    }
    return Object.fromEntries(counts);
  },
} as const;
