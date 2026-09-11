/**
 * BE が返した full markdown を表示用に分けた結果。
 * `frontmatter` は開始 / 閉じフェンス（`---`）を含む原文、`body` は閉じフェンスの次行以降。
 */
export type PreviewMarkdown = {
  frontmatter: string;
  body: string;
};

/** 開始フェンス。markdown 先頭がこれで始まる場合のみ frontmatter ありとみなす */
const OPENING_FENCE = "---\n";

/**
 * 閉じフェンス。改行直後の `---` で、その直後が改行か入力末尾のもの。
 * `----` / `---x` / `--- `（末尾空白）は先読みを満たさないので候補から外れ、次の候補に進む。
 */
const CLOSING_FENCE = /\n---(?=\n|$)/;

/** `\n---` の長さ。閉じフェンス開始位置からこの分だけ進めると `---` の直後になる */
const CLOSING_FENCE_LENGTH = "\n---".length;

/**
 * 開始フェンス直後から最初の閉じフェンス（先頭の `\n`）の位置を返す。
 * @param normalized - CRLF → LF 正規化済みで `---\n` から始まる markdown
 * @returns 閉じフェンスの `\n` の index。見つからなければ `undefined`
 */
const findClosingFenceStart = (normalized: string): number | undefined => {
  const searchTarget = normalized.slice(OPENING_FENCE.length);
  const found = searchTarget.search(CLOSING_FENCE);
  if (found < 0) {
    return undefined;
  }
  return found + OPENING_FENCE.length;
};

export const PreviewMarkdown = {
  /**
   * full markdown を frontmatter と本文に分ける。YAML の parse / stringify は行わず、fence だけを見る。
   * 閉じフェンスは「改行直後の `---` で、その直後が改行か入力末尾」の最初の 1 つ。
   * frontmatter 値中の `----` / `---x` 始まりの行は閉じフェンスとみなさず読み飛ばす。
   * @param markdown - BE の shared document codec が生成した full markdown
   * @returns 分割結果。先頭が `---\n` でない、または閉じフェンスが無ければ `undefined`
   */
  split: (markdown: string): PreviewMarkdown | undefined => {
    const normalized = markdown.replace(/\r\n/g, "\n");
    if (!normalized.startsWith(OPENING_FENCE)) {
      return undefined;
    }
    const closingStart = findClosingFenceStart(normalized);
    if (closingStart === undefined) {
      return undefined;
    }
    const fenceEnd = closingStart + CLOSING_FENCE_LENGTH;
    return {
      frontmatter: normalized.slice(0, fenceEnd),
      // 閉じフェンスが入力末尾なら slice の開始が範囲外になり "" が返る
      body: normalized.slice(fenceEnd + 1),
    };
  },
} as const;
