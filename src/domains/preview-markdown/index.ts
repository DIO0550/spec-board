/**
 * BE が返した full markdown を表示用に分けた結果。
 * `frontmatter` は開始 / 閉じフェンス（`---`）を含む原文、`body` は閉じフェンスの次行以降。
 */
export type PreviewMarkdown = {
  frontmatter: string;
  body: string;
};

export const PreviewMarkdown = {
  /**
   * full markdown を frontmatter と本文に分ける。YAML の parse / stringify は行わず、fence だけを見る。
   * @param markdown - BE の shared document codec が生成した full markdown
   * @returns 分割結果。先頭が `---\n` でない、または閉じフェンスが無ければ `undefined`
   */
  split: (markdown: string): PreviewMarkdown | undefined => {
    const normalized = markdown.replace(/\r\n/g, "\n");
    if (!normalized.startsWith("---\n")) {
      return undefined;
    }
    const closingStart = normalized.indexOf("\n---", 4);
    if (closingStart < 0) {
      return undefined;
    }
    const afterClosing = normalized[closingStart + 4];
    if (afterClosing !== undefined && afterClosing !== "\n") {
      return undefined;
    }
    return {
      frontmatter: normalized.slice(0, closingStart + 4),
      body: afterClosing === "\n" ? normalized.slice(closingStart + 5) : "",
    };
  },
} as const;
