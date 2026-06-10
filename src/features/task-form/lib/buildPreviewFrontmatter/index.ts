/**
 * プレビュー伝搬の値の型。`fields.state.values.priority`（`Priority | ""`）を
 * `string` として受けるため、branded `Priority` ではなく素の `string?` で定義する。
 */
export type PreviewFrontmatterInput = {
  title: string;
  status: string;
  /** PriorityField（`Priority | ""`）を string として受ける。未指定/空文字は省略。 */
  priority?: string;
  labels: string[];
  parent?: string;
  links: string[];
};

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
 * プレビュー用 frontmatter YAML を組み立てる。
 * フィールド順: title → status → priority → labels → parent → links。
 * 空値省略: priority 未指定/空文字は行なし / labels・links 空配列は行なし / parent 同様。
 * `serde_yaml_ng` の完全一致（エスケープ）までは追わない軽量実装で、
 * 値にコロン・改行・先頭 `#` 等を含むと YAML として崩れ得る（プレビュー目的のため許容）。
 * @param input - フォーム現在値
 * @returns `---\n...\n---` 形式の frontmatter ブロック
 */
export const buildPreviewFrontmatter = (
  input: PreviewFrontmatterInput,
): string => {
  const lines: string[] = [`title: ${input.title}`, `status: ${input.status}`];
  if (!isOmitted(input.priority)) {
    lines.push(`priority: ${input.priority}`);
  }
  lines.push(...buildListBlock("labels", input.labels));
  if (!isOmitted(input.parent)) {
    lines.push(`parent: ${input.parent}`);
  }
  lines.push(...buildListBlock("links", input.links));
  return `---\n${lines.join("\n")}\n---`;
};

/**
 * frontmatter ブロックと本文を結合し、プレビュー用の最終 markdown を返す。
 * 空本文のときは frontmatter のみ（末尾改行付き）を返す。
 * @param frontmatter - {@link buildPreviewFrontmatter} の出力
 * @param body - 本文 markdown
 * @returns 結合した最終 markdown
 */
export const combineMarkdown = (frontmatter: string, body: string): string => {
  if (body === "") {
    return `${frontmatter}\n`;
  }
  return `${frontmatter}\n${body}`;
};
