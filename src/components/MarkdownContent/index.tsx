import { Markdown } from "@/domains/markdown";
import { READONLY_RENDER_OPTIONS, renderBlock } from "./renderBlock";

export type MarkdownContentProps = {
  /** レンダリング対象の本文 markdown */
  body: string;
};

/**
 * Markdown 本文を純表示（編集不可）でレンダリングする共有部品。
 * detail / task-form 双方から利用し、本文描画ロジックを一本化する。
 * @param props - {@link MarkdownContentProps}
 * @returns ブロック描画した要素。本文が空（block なし）のときは null。
 */
export const MarkdownContent = (props: MarkdownContentProps) => {
  const blocks = Markdown.parse(props.body);
  if (blocks.length === 0) {
    return null;
  }
  return (
    <div className="space-y-4" data-testid="markdown-content">
      {blocks.map((block, i) => renderBlock(block, i, READONLY_RENDER_OPTIONS))}
    </div>
  );
};
