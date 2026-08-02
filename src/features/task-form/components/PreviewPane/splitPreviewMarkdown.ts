export type SplitPreviewMarkdown = {
  frontmatter: string;
  body: string;
};

/**
 * BE が返した full markdown を表示用に分ける。YAML の parse/stringify は行わず、fence だけを見る。
 */
export const splitPreviewMarkdown = (
  markdown: string,
): SplitPreviewMarkdown | null => {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return null;
  }
  const closingStart = normalized.indexOf("\n---", 4);
  if (closingStart < 0) {
    return null;
  }
  const afterClosing = normalized[closingStart + 4];
  if (afterClosing !== undefined && afterClosing !== "\n") {
    return null;
  }
  return {
    frontmatter: normalized.slice(0, closingStart + 4),
    body: afterClosing === "\n" ? normalized.slice(closingStart + 5) : "",
  };
};
