import type { Brand } from "@/types/brand";

/**
 * プレビュー表示用 frontmatter の形（shape 型）。
 * `fields.state.values.priority`（`Priority | ""`）を `string` として受けるため、
 * branded `Priority` ではなく素の `string?` で定義する。
 * 本ファイル外には export しない（factory `PreviewFrontmatter.from` の引数型として内部参照）。
 */
type PreviewFrontmatterShape = {
  title: string;
  status: string;
  /** PriorityField（`Priority | ""`）を string として受ける。未指定/空文字は省略。 */
  priority?: string;
  labels: string[];
  parent?: string;
  links: string[];
  /** 期限（`YYYY-MM-DD`）。未指定/空文字は行なし。 */
  due?: string;
  /** 下書きフラグ。true のときのみ `draft: true` 行を出力。 */
  draft?: boolean;
};

/**
 * プレビュー画面に表示される frontmatter ブロックの構造データ。
 * `Brand<_, "PreviewFrontmatter">` で nominal に保護されており、生成は本ファイル内
 * companion `PreviewFrontmatter.from` に閉じる（`src/types/brand.ts` の規約に従う）。
 */
export type PreviewFrontmatter = Brand<
  PreviewFrontmatterShape,
  "PreviewFrontmatter"
>;

/** YAML list item のインデント接頭辞。 */
const LIST_ITEM_PREFIX = "  - ";

/**
 * 値配列を `key:` 見出し + インデント付き list item ブロックに変換する。
 * 空配列のときは空配列（行なし）を返す。
 * @param key - 見出しキー（labels / links）
 * @param values - list item の値
 * @returns frontmatter に追加する行の配列
 */
const buildListBlock = (key: string, values: string[]): string[] => {
  if (values.length === 0) {
    return [];
  }
  return [`${key}:`, ...values.map((value) => `${LIST_ITEM_PREFIX}${value}`)];
};

/**
 * scalar 値が省略対象（未指定 / 空文字）かどうか。
 * @param value - 判定する値
 * @returns 省略すべきなら true
 */
const isOmitted = (value: string | undefined): value is undefined | "" =>
  value === undefined || value === "";

/**
 * `PreviewFrontmatter` の companion オブジェクト。
 * 生成（`from`）と YAML シリアライズ（`toYaml`）を 1 箇所に集約することで、
 * branded 値のライフサイクルを本ファイル内に閉じる。
 */
export const PreviewFrontmatter = {
  /**
   * 素のオブジェクトを `PreviewFrontmatter` ブランドに包んで返す factory。
   * 検証ロジックは行わない（フォーム側でフィールド単位に validate 済みのため）。
   * @param values - フォーム現在値由来の shape オブジェクト
   * @returns ブランド付き `PreviewFrontmatter` 値
   */
  from: (values: PreviewFrontmatterShape): PreviewFrontmatter =>
    values as PreviewFrontmatter,

  /**
   * プレビュー用 frontmatter YAML を組み立てる。
   * フィールド順: title → status → priority → labels → parent → links → draft → due
   * （BE の serialize 出力順に一致させる。draft は typed 固定順で links の後、
   *  due は extras のため最後）。
   * 空値省略: priority 未指定/空文字は行なし / labels・links 空配列は行なし /
   * parent・due 同様 / draft は true のときのみ行を出力。
   * `serde_yaml_ng` の完全一致（エスケープ）までは追わない軽量実装で、
   * 値にコロン・改行・先頭 `#` 等を含むと YAML として崩れ得る（プレビュー目的のため許容）。
   * @param input - companion `PreviewFrontmatter.from(...)` で構築したブランド付き値
   * @returns `---\n...\n---` 形式の frontmatter ブロック
   */
  toYaml: (input: PreviewFrontmatter): string => {
    const lines: string[] = [
      `title: ${input.title}`,
      `status: ${input.status}`,
    ];
    if (!isOmitted(input.priority)) {
      lines.push(`priority: ${input.priority}`);
    }
    lines.push(...buildListBlock("labels", input.labels));
    if (!isOmitted(input.parent)) {
      lines.push(`parent: ${input.parent}`);
    }
    lines.push(...buildListBlock("links", input.links));
    if (input.draft === true) {
      lines.push("draft: true");
    }
    if (!isOmitted(input.due)) {
      lines.push(`due: ${input.due}`);
    }
    return `---\n${lines.join("\n")}\n---`;
  },
};

/**
 * frontmatter ブロックと本文を結合し、プレビュー用の最終 markdown を返す。
 * 空本文のときは frontmatter のみ（末尾改行付き）を返す。
 * @param frontmatter - {@link PreviewFrontmatter.toYaml} の出力
 * @param body - 本文 markdown
 * @returns 結合した最終 markdown
 */
export const combineMarkdown = (frontmatter: string, body: string): string => {
  if (body === "") {
    return `${frontmatter}\n`;
  }
  return `${frontmatter}\n${body}`;
};
