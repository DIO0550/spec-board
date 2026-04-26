/** インライントークン（装飾済みのテキスト断片） */
export type InlineToken =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong"; value: string };

/** ブロック要素 */
export type Block =
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: readonly string[] }
  | { type: "codeblock"; code: string }
  | { type: "paragraph"; text: string };

/**
 * 行頭が code fence かどうかを判定する。言語タグ付き（` ```ts ` 等）も含む。
 * @param line - 1 行
 * @returns 開閉どちらでも fence なら true
 */
const isFence = (line: string): boolean => line.startsWith("```");

/**
 * 行が空（空白のみ含む）かどうか。
 * @param line - 1 行
 * @returns 空ならば true
 */
const isBlank = (line: string): boolean => line.trim() === "";

/**
 * 1 ～ 3 個の `#` から始まる heading を解析する。
 * @param line - 1 行
 * @returns level と本文、heading でなければ undefined
 */
const matchHeading = (
  line: string,
): { level: 1 | 2 | 3; text: string } | undefined => {
  const m = line.match(/^(#{1,3})\s+(.*)/);
  if (m === null) return undefined;
  const level = m[1].length as 1 | 2 | 3;
  return { level, text: m[2] };
};

/**
 * リストアイテム行を解析する。
 * @param line - 1 行
 * @returns リスト本文、リストでなければ undefined
 */
const matchListItem = (line: string): string | undefined => {
  const m = line.match(/^[-*]\s+(.*)/);
  return m === null ? undefined : m[1];
};

/** Markdown ドメインの companion */
export const Markdown = {
  /**
   * テキストをインライントークンに分解する。
   * `code`（バッククォート 1 対）/ `**strong**`（アスタリスク 2 対）に対応。
   * @param text - インラインを含むテキスト
   * @returns InlineToken の配列
   */
  tokenizeInline: (text: string): readonly InlineToken[] => {
    const tokens: InlineToken[] = [];
    const regex = /(`[^`]+`|\*\*(.+?)\*\*)/g;
    let lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      const idx = match.index ?? 0;
      if (idx > lastIndex) {
        tokens.push({ type: "text", value: text.slice(lastIndex, idx) });
      }
      const matched = match[0];
      if (matched.startsWith("`")) {
        tokens.push({ type: "code", value: matched.slice(1, -1) });
      } else {
        tokens.push({ type: "strong", value: match[2] });
      }
      lastIndex = idx + matched.length;
    }
    if (lastIndex < text.length) {
      tokens.push({ type: "text", value: text.slice(lastIndex) });
    }
    return tokens;
  },

  /**
   * Markdown 本文を Block の配列に変換する。
   * - 改行は `\r\n` および単独 `\r` を `\n` に正規化してから処理
   * - 空 / 空白のみ body は `[]`
   * - 空行は block 化せずスキップ（paragraph 区切り）
   * - paragraph は連続する非ブロック行を半角スペースで連結
   * - fence 開始行の言語タグ（` ```ts ` 等）はパース対象外（捨てる）
   * - 未閉鎖 fence は本文末尾までを 1 つの codeblock として扱う
   * - codeblock 内のテキストは inline 化しない（raw text として保持）
   *
   * @param source - Markdown 本文
   * @returns Block の配列
   */
  parse: (source: string): readonly Block[] => {
    if (source.trim() === "") return [];
    const normalized = source.replace(/\r\n?/g, "\n");
    const lines = normalized.split("\n");
    const blocks: Block[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      if (isFence(line)) {
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !isFence(lines[i])) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++;
        blocks.push({ type: "codeblock", code: codeLines.join("\n") });
        continue;
      }

      if (isBlank(line)) {
        i++;
        continue;
      }

      const heading = matchHeading(line);
      if (heading !== undefined) {
        const blockType = `h${heading.level}` as "h1" | "h2" | "h3";
        blocks.push({ type: blockType, text: heading.text });
        i++;
        continue;
      }

      if (matchListItem(line) !== undefined) {
        const items: string[] = [];
        while (i < lines.length) {
          const item = matchListItem(lines[i]);
          if (item === undefined) break;
          items.push(item);
          i++;
        }
        blocks.push({ type: "ul", items });
        continue;
      }

      const paraLines: string[] = [];
      while (i < lines.length) {
        const cur = lines[i];
        if (
          isBlank(cur) ||
          isFence(cur) ||
          matchHeading(cur) !== undefined ||
          matchListItem(cur) !== undefined
        )
          break;
        paraLines.push(cur);
        i++;
      }
      if (paraLines.length > 0) {
        blocks.push({ type: "paragraph", text: paraLines.join(" ") });
      }
    }
    return blocks;
  },
} as const;
