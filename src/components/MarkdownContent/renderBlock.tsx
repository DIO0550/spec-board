import type { ReactNode } from "react";
import { BodyTaskProgress } from "@/components/BodyTaskProgress";
import {
  type Block,
  type InlineToken,
  Markdown,
  type TaskListItem,
} from "@/domains/markdown";

/** renderBlock に渡す checkbox のインタラクション制御 */
export type RenderBlockOptions = {
  /** checkbox を操作可能にするか（編集確定経路がある場合のみ true） */
  interactive: boolean;
  /**
   * checkbox toggle 時に呼ぶハンドラ。
   * @param sourceLine - 反転対象の source 行番号
   */
  onToggle: (sourceLine: number) => void;
};

/**
 * 純表示モードでは checkbox を操作させないため toggle は何もしない。
 * @param _sourceLine - 未使用（純表示のため反転対象を持たない）
 */
const noToggle = (_sourceLine: number): void => {};

/** checkbox を操作させない純表示用の固定オプション。 */
export const READONLY_RENDER_OPTIONS: RenderBlockOptions = {
  interactive: false,
  onToggle: noToggle,
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
 * 空 checkbox（本文なし）でもアクセシブル名が空にならないための fallback 文言。
 */
const EMPTY_TASK_ARIA_LABEL = "本文タスクを切り替え";

/**
 * ul の 1 項目（task / plain）を li に変換する。
 * task 項目はネイティブ checkbox（`dangerouslySetInnerHTML` 不使用）で描画し、
 * 親 display ラッパへの click / keydown 伝播を止めて edit 同時起動を防ぐ。
 *
 * @param item - 描画する項目
 * @param idx - 同名アイテムでの key 衝突回避用 index
 * @param options - checkbox のインタラクション制御
 * @returns li 要素
 */
const renderListItem = (
  item: TaskListItem,
  idx: number,
  options: RenderBlockOptions,
): ReactNode => {
  if (item.kind === "task") {
    return (
      <li
        key={`${idx}-task`}
        className="-ml-6 flex list-none items-start gap-2"
      >
        <input
          type="checkbox"
          checked={item.checked}
          disabled={!options.interactive}
          onChange={() => options.onToggle(item.sourceLine)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          aria-label={
            item.text === "" ? EMPTY_TASK_ARIA_LABEL : `${item.text} を切り替え`
          }
        />
        <span>{renderInline(Markdown.tokenizeInline(item.text))}</span>
      </li>
    );
  }
  return (
    <li key={`${idx}-plain`}>
      {renderInline(Markdown.tokenizeInline(item.text))}
    </li>
  );
};

/**
 * Block 型を JSX に変換する。display 専用部品（{@link MarkdownContent}）と
 * 編集可能な `MarkdownBody` の双方が共有し、描画ロジックの二重定義を防ぐ。
 *
 * @param block - 1 ブロック
 * @param key - React の key
 * @param options - checkbox のインタラクション制御
 * @returns React 要素
 */
export const renderBlock = (
  block: Block,
  key: number,
  options: RenderBlockOptions,
): ReactNode => {
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
    const { done, total } = Markdown.countTaskProgress(block.items);
    return (
      <div key={key}>
        <BodyTaskProgress done={done} total={total} />
        <ul className="list-disc pl-6">
          {block.items.map((item, idx) => renderListItem(item, idx, options))}
        </ul>
      </div>
    );
  }
  if (block.type === "blockquote") {
    return (
      <blockquote
        key={key}
        className="border-l-4 border-surface-muted pl-4 text-muted"
      >
        {block.lines.map((line, idx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 同文言行で key 衝突しないよう idx を併用する
          <p key={`${idx}-${line}`}>
            {renderInline(Markdown.tokenizeInline(line))}
          </p>
        ))}
      </blockquote>
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
