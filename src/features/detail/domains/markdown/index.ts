/** インライントークン（装飾済みのテキスト断片） */
export type InlineToken =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong"; value: string };

/**
 * タスクリスト / 箇条書きの 1 項目（判別 union）。
 * - `task`: `- [ ]` / `- [x]` / `- [X]` 形式。`sourceLine` は source 上の行番号で
 *   `toggleTaskAt` が書き換え対象を同定する唯一のキー。
 * - `plain`: チェックボックスを持たない通常の箇条書き項目。
 */
export type TaskListItem =
  | { kind: "task"; checked: boolean; sourceLine: number; text: string }
  | { kind: "plain"; text: string };

/** ブロック要素 */
export type Block =
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: readonly TaskListItem[] }
  | { type: "blockquote"; lines: readonly string[] }
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
 * 行末の `\r`（CRLF 由来）を除いた本文を返す。マッチ判定はこの値に対して行う。
 * 単独 `\r`（行途中の旧 Mac 改行）は除去せず保持する。
 * @param line - 1 行
 * @returns 末尾 `\r` を除いた本文
 */
const stripCr = (line: string): string =>
  line.endsWith("\r") ? line.slice(0, -1) : line;

/**
 * 1 ～ 3 個の `#` から始まる heading を解析する。
 * @param line - 1 行
 * @returns level と本文、heading でなければ undefined
 */
const matchHeading = (
  line: string,
): { level: 1 | 2 | 3; text: string } | undefined => {
  const m = line.match(/^(#{1,3})\s+(.*)/);
  if (m === null) {
    return undefined;
  }
  const level = m[1].length as 1 | 2 | 3;
  return { level, text: m[2] };
};

/**
 * `> 引用` 行を判定し、`>` と直後の空白 1 つを除いた本文を返す。
 * @param line - 1 行
 * @returns 引用本文、blockquote でなければ undefined
 */
const matchBlockquote = (line: string): string | undefined => {
  const m = line.match(/^>\s?(.*)/);
  return m === null ? undefined : m[1];
};

/**
 * リストアイテム行（先頭空白なしの `- ` / `* `）を解析する。ネストは対象外。
 * @param line - 1 行
 * @returns リスト本文、リストでなければ undefined
 */
const matchListItemRaw = (line: string): string | undefined => {
  const m = line.match(/^[-*]\s+(.*)/);
  return m === null ? undefined : m[1];
};

/**
 * タスク行（先頭空白なしの `- `/`* ` リスト + `[ ]`/`[x]`/`[X]`）を分解する単一定義。
 * `parse` の task/plain 分類と `toggleTaskAt` の書き換えが共にこれを参照することで、
 * 判定の二重定義（parse と toggle のズレ）を構造的に防ぐ。task でなければ undefined。
 *
 * `[ ]` の後は「末尾」または「空白 + 本文」のみ task として認める
 * （`- []` / `- [ ]text` は task ではない）。
 *
 * @param line - 末尾 `\r` を除いた 1 行
 * @returns markerPrefix / checked / tail / text、task でなければ undefined
 */
const parseTaskLine = (
  line: string,
):
  | { markerPrefix: string; checked: boolean; tail: string; text: string }
  | undefined => {
  const m = line.match(/^([-*]\s+)\[( |x|X)\]((?:\s+(.*))?)$/);
  if (m === null) {
    return undefined;
  }
  return {
    markerPrefix: m[1],
    checked: m[2] !== " ",
    tail: m[3],
    text: m[4] ?? "",
  };
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
   * - 行は `source.split("\n")` で分解し、マッチ判定は末尾 `\r` を除いた値で行う（CRLF 対応）。
   *   単独 `\r`（`\n` を伴わない旧 Mac 改行）は行区切りとして扱わず 1 行に保持する。
   * - 空 / 空白のみ body は `[]`
   * - 空行は block 化せずスキップ（paragraph 区切り）
   * - paragraph は連続する非ブロック行を半角スペースで連結
   * - ul は task 項目（`- [ ]` / `- [x]` / `- [X]`）と plain 項目を判別 union で保持。
   *   task 項目には source 上の行番号を `sourceLine` として付与する（`toggleTaskAt` が使う唯一の同定キー）。
   * - blockquote（`>` 連続行）を 1 ブロックに収集。引用内は inline のみ（ブロック再帰なし）。
   * - 未閉鎖 fence は本文末尾までを 1 つの codeblock として扱う。
   * - codeblock 内のテキストは inline 化しない（raw text として保持）。
   *
   * @param source - Markdown 本文
   * @returns Block の配列
   */
  parse: (source: string): readonly Block[] => {
    if (source.trim() === "") {
      return [];
    }
    const lines = source.split("\n");
    const blocks: Block[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = stripCr(lines[i]);

      if (isFence(line)) {
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !isFence(stripCr(lines[i]))) {
          codeLines.push(stripCr(lines[i]));
          i++;
        }
        if (i < lines.length) {
          i++;
        }
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

      if (matchBlockquote(line) !== undefined) {
        const quoteLines: string[] = [];
        while (i < lines.length) {
          const quote = matchBlockquote(stripCr(lines[i]));
          if (quote === undefined) {
            break;
          }
          quoteLines.push(quote);
          i++;
        }
        blocks.push({ type: "blockquote", lines: quoteLines });
        continue;
      }

      if (matchListItemRaw(line) !== undefined) {
        const items: TaskListItem[] = [];
        while (i < lines.length) {
          const stripped = stripCr(lines[i]);
          const raw = matchListItemRaw(stripped);
          if (raw === undefined) {
            break;
          }
          const task = parseTaskLine(stripped);
          if (task === undefined) {
            items.push({ kind: "plain", text: raw });
          } else {
            // i が source 上の行番号。これをそのまま sourceLine にすることで
            // toggleTaskAt(body, sourceLine) と完全一致する（出現順カウント不要）。
            items.push({
              kind: "task",
              checked: task.checked,
              sourceLine: i,
              text: task.text,
            });
          }
          i++;
        }
        blocks.push({ type: "ul", items });
        continue;
      }

      const paraLines: string[] = [];
      while (i < lines.length) {
        const cur = stripCr(lines[i]);
        if (
          isBlank(cur) ||
          isFence(cur) ||
          matchHeading(cur) !== undefined ||
          matchBlockquote(cur) !== undefined ||
          matchListItemRaw(cur) !== undefined
        ) {
          break;
        }
        paraLines.push(cur);
        i++;
      }
      if (paraLines.length > 0) {
        blocks.push({ type: "paragraph", text: paraLines.join(" ") });
      }
    }
    return blocks;
  },

  /**
   * source の `sourceLine` 行目（`source.split("\n")` の index）の checkbox のみ
   * `[ ]`↔`[x]` を反転する pure 関数。末尾 `\r`・空白・未対応記法はすべて保持し、
   * 対象行以外は不変。範囲外 index・非 task 行のときは原文をそのまま返す（防御的）。
   *
   * @param source - 元の Markdown 本文
   * @param sourceLine - 反転対象の行番号（`parse` が付与した sourceLine）
   * @returns 対象行のみ反転した本文、または原文
   */
  toggleTaskAt: (source: string, sourceLine: number): string => {
    const lines = source.split("\n");
    if (sourceLine < 0 || sourceLine >= lines.length) {
      return source;
    }
    const raw = lines[sourceLine];
    const hasCr = raw.endsWith("\r");
    const content = hasCr ? raw.slice(0, -1) : raw;
    const task = parseTaskLine(content);
    if (task === undefined) {
      return source;
    }
    const toggled = task.checked ? " " : "x";
    lines[sourceLine] = `${task.markerPrefix}[${toggled}]${task.tail}${
      hasCr ? "\r" : ""
    }`;
    return lines.join("\n");
  },

  /**
   * タスクリストブロックの進捗（done=checked 数, total=task 項目数）を集計する。
   * plain 項目は total / done のいずれからも除外する。
   *
   * @param items - ul ブロックの items
   * @returns done（checked 数）と total（task 項目数）
   */
  countTaskProgress: (
    items: readonly TaskListItem[],
  ): { done: number; total: number } => {
    const tasks = items.filter((item) => item.kind === "task");
    const done = tasks.filter(
      (item) => item.kind === "task" && item.checked,
    ).length;
    return { done, total: tasks.length };
  },
} as const;
