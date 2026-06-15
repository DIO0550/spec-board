/** ツールバーが適用できる記法の種別。 */
export type MarkdownInsertKind =
  | "heading"
  | "bold"
  | "italic"
  | "code"
  | "quote"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "link";

/** textarea の選択範囲（selectionStart / selectionEnd 相当）。 */
export type TextSelection = {
  start: number;
  end: number;
};

/** 記法適用結果。text は全文、selection は適用後に復元すべき選択範囲。 */
export type MarkdownInsertResult = {
  text: string;
  selection: TextSelection;
};

/**
 * タスク行の受理パターン。`domains/markdown` の `parseTaskLine` と同じ受理集合
 * （marker は `-`/`*`、チェックは `[ ]`/`[x]`/`[X]`、チェック後は末尾か空白 + 本文のみ）。
 * プレビューの `Markdown.parse` がタスク行と認識する行へ `- [ ] ` を二重付与
 * しないための整合で、同値性は golden テストで担保する。
 */
const TASK_LINE_PATTERN = /^([-*]\s+)\[( |x|X)\]((?:\s+(.*))?)$/;

/** 行プレフィックス系記法の判定・付与・剥がしの規則。 */
type LineRule = {
  /**
   * 行が既に記法適用済みか。
   * @param line - 対象行
   * @returns 適用済みなら true
   */
  isApplied: (line: string) => boolean;
  /**
   * 記法を付与した行を返す。
   * @param line - 対象行
   * @returns 付与後の行
   */
  add: (line: string) => string;
  /**
   * 記法を剥がした行を返す（isApplied が true の行にのみ呼ばれる）。
   * @param line - 対象行
   * @returns 剥がし後の行
   */
  strip: (line: string) => string;
};

/**
 * heading 行規則のプレフィックス。
 */
const HEADING_PREFIX = "## ";

/** quote 行規則のプレフィックス。 */
const QUOTE_PREFIX = "> ";

/** orderedList 付与時の正規形プレフィックス（番号は常に 1 で付与する）。 */
const ORDERED_PREFIX = "1. ";

/** orderedList の strip 用パターン（`12.  ` のような任意桁数 + 空白を剥がす）。 */
const ORDERED_LINE_PATTERN = /^\d+\.\s+/;

/** bulletList 行規則のプレフィックス。 */
const BULLET_PREFIX = "- ";

/** taskList 付与時の正規形プレフィックス（marker `*` や `[x]` には揃えない）。 */
const TASK_PREFIX = "- [ ] ";

/**
 * taskList の strip。受理パターンにマッチした行から本文だけを取り出す。
 * @param line - 対象行（isApplied が true の行）
 * @returns 本文（チェックのみの行は空文字）
 */
const stripTaskLine = (line: string): string => {
  const m = line.match(TASK_LINE_PATTERN);
  return m?.[4] ?? "";
};

/**
 * 固定プレフィックス（heading / bulletList）の行規則を作る。
 * @param prefix - 行頭プレフィックス
 * @returns 行規則
 */
const prefixRule = (prefix: string): LineRule => ({
  /**
   * 行がプレフィックス済みか。
   * @param line - 対象行
   * @returns 適用済みなら true
   */
  isApplied: (line) => line.startsWith(prefix),
  /**
   * プレフィックスを付与する。
   * @param line - 対象行
   * @returns 付与後の行
   */
  add: (line) => `${prefix}${line}`,
  /**
   * プレフィックスを剥がす。
   * @param line - 対象行
   * @returns 剥がし後の行
   */
  strip: (line) => line.slice(prefix.length),
});

/** 記法種別ごとの行規則（各メンバの契約は {@link LineRule} を参照）。 */
const LINE_RULES: Record<
  "heading" | "quote" | "bulletList" | "orderedList" | "taskList",
  LineRule
> = {
  heading: prefixRule(HEADING_PREFIX),
  quote: prefixRule(QUOTE_PREFIX),
  bulletList: prefixRule(BULLET_PREFIX),
  orderedList: {
    /**
     * 行が番号付きリスト（`N. `）か。
     * @param line - 対象行
     * @returns 番号付き行なら true
     */
    isApplied: (line) => ORDERED_LINE_PATTERN.test(line),
    /**
     * 正規形 `1. ` を付与する。
     * @param line - 対象行
     * @returns 付与後の行
     */
    add: (line) => `${ORDERED_PREFIX}${line}`,
    /**
     * 番号プレフィックスを剥がす。
     * @param line - 対象行（isApplied が true の行）
     * @returns 剥がし後の行
     */
    strip: (line) => line.replace(ORDERED_LINE_PATTERN, ""),
  },
  taskList: {
    /**
     * 行が task 行か（受理集合は {@link TASK_LINE_PATTERN}）。
     * @param line - 対象行
     * @returns task 行なら true
     */
    isApplied: (line) => TASK_LINE_PATTERN.test(line),
    /**
     * 正規形 `- [ ] ` を付与する。
     * @param line - 対象行
     * @returns 付与後の行
     */
    add: (line) => `${TASK_PREFIX}${line}`,
    strip: stripTaskLine,
  },
};

/** インライン系記法の囲みマーカー。 */
const INLINE_MARKERS: Record<"bold" | "italic" | "code", string> = {
  bold: "**",
  italic: "*",
  code: "`",
};

/**
 * 選択範囲を [0, text.length] にクランプし、逆転していれば入れ替える。
 * 公開 pure 関数として呼び出し側の状態異常でも安全な結果を返すための防御。
 * @param text - 現在の全文
 * @param selection - 生の選択範囲
 * @returns 正規化済み選択範囲
 */
const normalizeSelection = (
  text: string,
  selection: TextSelection,
): TextSelection => {
  /**
   * 位置を [0, text.length] に収める。
   * @param pos - 生のオフセット
   * @returns クランプ済みオフセット
   */
  const clamp = (pos: number): number =>
    Math.min(Math.max(pos, 0), text.length);
  const a = clamp(selection.start);
  const b = clamp(selection.end);
  if (a > b) {
    return { start: b, end: a };
  }
  return { start: a, end: b };
};

/**
 * 選択が marker 対でちょうど囲まれているか（トグル解除対象か）を判定する。
 * 単一文字マーカー（italic `*` / code `` ` ``）は、外側にさらに同じ文字が続く場合
 * （`**` = bold など別マーカーの一部）を除外する。これにより `**word**` の `word` へ
 * italic を適用しても bold を剥がさず `***word***` になる。
 * @param before - 選択より前の全文
 * @param after - 選択より後の全文
 * @param marker - 囲みマーカー
 * @returns ちょうど marker で囲まれていれば true
 */
const isInlineWrapped = (
  before: string,
  after: string,
  marker: string,
): boolean => {
  if (!before.endsWith(marker) || !after.startsWith(marker)) {
    return false;
  }
  if (marker.length === 1) {
    const beforeInner = before.slice(0, before.length - marker.length);
    const afterInner = after.slice(marker.length);
    if (beforeInner.endsWith(marker) || afterInner.startsWith(marker)) {
      return false;
    }
  }
  return true;
};

/**
 * 選択文字列をマーカー対で囲む（bold / italic / code）。
 * 選択が既にマーカー対で囲まれている場合は剥がす（トグル）。
 * @param marker - 囲みマーカー
 * @param text - 現在の全文
 * @param selection - 正規化済み選択範囲
 * @returns 適用結果（選択範囲は装飾の内側を維持）
 */
const applyInline = (
  marker: string,
  text: string,
  selection: TextSelection,
): MarkdownInsertResult => {
  const before = text.slice(0, selection.start);
  const selected = text.slice(selection.start, selection.end);
  const after = text.slice(selection.end);
  // 選択の直前直後が既にマーカーなら剥がす（再適用でトグル解除になる）。
  // ただし単一文字マーカー（italic `*` / code `` ` ``）は、外側にさらに同じ文字が続く
  // 場合（`**`= bold 等）を別マーカーとみなし剥がさない（italic 適用で bold を壊さない）。
  if (isInlineWrapped(before, after, marker)) {
    return {
      text: `${before.slice(0, before.length - marker.length)}${selected}${after.slice(marker.length)}`,
      selection: {
        start: selection.start - marker.length,
        end: selection.end - marker.length,
      },
    };
  }
  return {
    text: `${before}${marker}${selected}${marker}${after}`,
    selection: {
      start: selection.start + marker.length,
      end: selection.end + marker.length,
    },
  };
};

/**
 * 選択文字列をリンク記法 `[text](url)` に変換し、URL 入力位置へカーソルを移す。
 * @param text - 現在の全文
 * @param selection - 正規化済み選択範囲
 * @returns 適用結果（selection は `()` の内側へ折りたたむ）
 */
const applyLink = (
  text: string,
  selection: TextSelection,
): MarkdownInsertResult => {
  const before = text.slice(0, selection.start);
  const selected = text.slice(selection.start, selection.end);
  const after = text.slice(selection.end);
  const nextText = `${before}[${selected}]()${after}`;
  // カーソルは URL を入力する `()` の内側へ畳む。
  // 位置 = before.length + "[".length(1) + selected.length + "](".length(2)
  const urlCaret = before.length + selected.length + 3;
  return {
    text: nextText,
    selection: { start: urlCaret, end: urlCaret },
  };
};

/**
 * 位置 pos が属する行の index を返す。
 * @param lineStarts - 各行の開始オフセット
 * @param pos - 全文中のオフセット
 * @returns 行 index
 */
const lineIndexAt = (lineStarts: readonly number[], pos: number): number => {
  for (let i = lineStarts.length - 1; i >= 0; i--) {
    if (pos >= lineStarts[i]) {
      return i;
    }
  }
  return 0;
};

/**
 * 行プレフィックス系記法（heading / bulletList / taskList）を適用する。
 * 選択が掛かるすべての行を対象に、全行適用済みなら剥がし（トグル）、
 * それ以外は未適用行へ付与する（混在は付与で統一）。
 * @param rule - 行規則
 * @param text - 現在の全文
 * @param selection - 正規化済み選択範囲
 * @returns 適用結果（選択範囲は変更後の行位置に追従）
 */
const applyLinePrefix = (
  rule: LineRule,
  text: string,
  selection: TextSelection,
): MarkdownInsertResult => {
  const lines = text.split("\n");
  const lineStarts: number[] = [];
  let acc = 0;
  for (const line of lines) {
    lineStarts.push(acc);
    acc += line.length + 1;
  }
  const firstLine = lineIndexAt(lineStarts, selection.start);
  // textarea の selectionEnd は exclusive のため、非空選択では end - 1 を
  // 対象終端にする（end が次行の行頭にあるとき未選択の次行を巻き込まない）。
  // 空選択（カーソルのみ）は end 位置の行をそのまま対象にする。
  const endAnchor =
    selection.end > selection.start ? selection.end - 1 : selection.end;
  const lastLine = lineIndexAt(lineStarts, endAnchor);

  const targets = lines.slice(firstLine, lastLine + 1);
  const shouldStrip = targets.every((line) => rule.isApplied(line));

  // 各行の長さ変化（delta）を記録しながら新しい行を組み立てる。
  const deltas: number[] = lines.map(() => 0);
  const newLines = lines.map((line, index) => {
    if (index < firstLine || index > lastLine) {
      return line;
    }
    if (shouldStrip) {
      const stripped = rule.strip(line);
      deltas[index] = stripped.length - line.length;
      return stripped;
    }
    if (rule.isApplied(line)) {
      return line;
    }
    const added = rule.add(line);
    deltas[index] = added.length - line.length;
    return added;
  });

  /**
   * 選択位置を変更後テキストへ写像する（前方行の delta 合計 + 自行内の調整）。
   * @param pos - 変更前テキスト中のオフセット
   * @returns 変更後テキスト中のオフセット
   */
  const remap = (pos: number): number => {
    const lineIndex = lineIndexAt(lineStarts, pos);
    let next = pos;
    for (let i = firstLine; i < lineIndex; i++) {
      next += deltas[i];
    }
    const delta = deltas[lineIndex] ?? 0;
    if (delta > 0) {
      next += delta;
    }
    if (delta < 0) {
      // 剥がしでは行内オフセットが負にならないよう行頭でクランプする。
      const lineStart = lineStarts[lineIndex];
      const rel = pos - lineStart;
      next -= Math.min(rel, -delta);
    }
    return next;
  };

  return {
    text: newLines.join("\n"),
    selection: { start: remap(selection.start), end: remap(selection.end) },
  };
};

/** Markdown 記法挿入の companion object（pure function のみ）。 */
export const MarkdownInsert = {
  /**
   * 指定種別の記法を選択範囲に適用する。
   * @param kind - 記法種別
   * @param text - 現在の全文
   * @param selection - 現在の選択範囲（範囲外・逆転は正規化して処理する）
   * @returns 適用後の全文と選択範囲
   */
  apply: (
    kind: MarkdownInsertKind,
    text: string,
    selection: TextSelection,
  ): MarkdownInsertResult => {
    const normalized = normalizeSelection(text, selection);
    if (kind === "bold" || kind === "italic" || kind === "code") {
      return applyInline(INLINE_MARKERS[kind], text, normalized);
    }
    if (kind === "link") {
      return applyLink(text, normalized);
    }
    return applyLinePrefix(LINE_RULES[kind], text, normalized);
  },
};
