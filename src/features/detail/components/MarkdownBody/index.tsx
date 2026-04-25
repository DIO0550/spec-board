import type { ReactNode } from "react";
import {
  type Block,
  type InlineToken,
  Markdown,
} from "@/features/detail/domains/markdown";

type MarkdownBodyProps = {
  body: string;
};

/**
 * インライントークンを React ノードに変換する。
 * @param tokens - インライントークン列
 * @returns React ノードの配列
 */
const renderInline = (tokens: readonly InlineToken[]): ReactNode[] =>
  tokens.map((token, idx) => {
    const key = `${token.type}-${idx}-${token.value}`;
    if (token.type === "code") {
      return <code key={key}>{token.value}</code>;
    }
    if (token.type === "strong") {
      return <strong key={key}>{token.value}</strong>;
    }
    return token.value;
  });

/**
 * Block 型を JSX に変換する。
 * @param block - 1 ブロック
 * @param key - React の key
 * @returns React 要素
 */
const renderBlock = (block: Block, key: number): ReactNode => {
  if (block.type === "h1") {
    return (
      <h1 key={key} className="mt-8 mb-4 text-3xl font-bold leading-tight">
        {renderInline(Markdown.tokenizeInline(block.text))}
      </h1>
    );
  }
  if (block.type === "h2") {
    return (
      <h2 key={key} className="mt-7 mb-3 text-2xl font-semibold leading-tight">
        {renderInline(Markdown.tokenizeInline(block.text))}
      </h2>
    );
  }
  if (block.type === "h3") {
    return (
      <h3 key={key} className="mt-6 mb-3 text-xl font-semibold leading-snug">
        {renderInline(Markdown.tokenizeInline(block.text))}
      </h3>
    );
  }
  if (block.type === "ul") {
    return (
      <ul key={key} className="list-disc pl-6">
        {block.items.map((item) => (
          <li key={item}>{renderInline(Markdown.tokenizeInline(item))}</li>
        ))}
      </ul>
    );
  }
  if (block.type === "codeblock") {
    return (
      <pre key={key} className="overflow-x-auto">
        <code>{block.code}</code>
      </pre>
    );
  }
  return <p key={key}>{renderInline(Markdown.tokenizeInline(block.text))}</p>;
};

/**
 * @param props - {@link MarkdownBodyProps}
 * @returns Markdown をレンダリングした要素、body が空なら null
 */
export const MarkdownBody = ({ body }: MarkdownBodyProps) => {
  const blocks = Markdown.parse(body);
  if (blocks.length === 0) return null;
  return (
    <div className="space-y-4" data-testid="markdown-body">
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  );
};
