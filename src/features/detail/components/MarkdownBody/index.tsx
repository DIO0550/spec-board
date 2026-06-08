import type { ReactNode } from "react";
import {
  type Block,
  type InlineToken,
  Markdown,
  type TaskListItem,
} from "@/features/detail/domains/markdown";
import {
  MarkdownBodyEditMode,
  useMarkdownBodyEdit,
} from "@/features/detail/hooks/useMarkdownBodyEdit";
import { BodyTaskProgress } from "../BodyTaskProgress";

/** renderBlock に渡す checkbox のインタラクション制御 */
type RenderBlockOptions = {
  /** checkbox を操作可能にするか（onConfirm 指定時のみ true） */
  interactive: boolean;
  /**
   * checkbox toggle 時に呼ぶハンドラ。
   * @param sourceLine - 反転対象の source 行番号
   */
  onToggle: (sourceLine: number) => void;
};

type MarkdownBodyProps = {
  body: string;
  /**
   * 編集確定時のコールバック。未指定なら display 専用（編集起動不可）。
   * @param body - 確定された本文（未 trim の生値、空文字も可）
   */
  onConfirm?: (body: string) => void;
};

const TEXTAREA_CLASS_NAME =
  "w-full min-h-[12rem] resize-none overflow-y-auto rounded border border-accent px-2 py-1 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent";

const DISPLAY_EDITABLE_WRAPPER_CLASS_NAME =
  "min-h-[3rem] cursor-text rounded px-1 py-0.5 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

const DISPLAY_READONLY_WRAPPER_CLASS_NAME = "space-y-4";

const PLACEHOLDER_CLASS_NAME = "text-sm text-muted";

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
 * Block 型を JSX に変換する。
 * @param block - 1 ブロック
 * @param key - React の key
 * @param options - checkbox のインタラクション制御
 * @returns React 要素
 */
const renderBlock = (
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

/**
 * Markdown 本文を表示・編集するコンポーネント。
 *
 * - `onConfirm` 未指定なら従来通り display 専用（空 body のとき null）。
 * - `onConfirm` 指定なら display↔edit 切替対応。空 body は placeholder 表示。
 * - 状態管理・キーバインド・focus 制御は `useMarkdownBodyEdit` に委譲する。
 *
 * @param props - {@link MarkdownBodyProps}
 * @returns Markdown 描画 / 編集用 textarea / null のいずれか
 */
export const MarkdownBody = ({ body, onConfirm }: MarkdownBodyProps) => {
  const edit = useMarkdownBodyEdit({ body, onConfirm });

  const handleToggle = (sourceLine: number) => {
    if (onConfirm === undefined) {
      return;
    }
    onConfirm(Markdown.toggleTaskAt(body, sourceLine));
  };

  // checkbox を操作可能にするのは編集確定経路（onConfirm）が存在する場合のみ。
  // edit モード中は textarea を描画するため renderBlock 自体が呼ばれない。
  const renderOptions = {
    interactive: onConfirm !== undefined,
    onToggle: handleToggle,
  };

  if (edit.mode === MarkdownBodyEditMode.Edit) {
    return (
      <textarea
        ref={edit.textareaRef}
        className={TEXTAREA_CLASS_NAME}
        value={edit.editValue}
        onChange={(e) => edit.setEditValue(e.target.value)}
        onKeyDown={edit.handleTextareaKeyDown}
        data-testid="markdown-body-textarea"
        aria-label="本文を編集"
      />
    );
  }

  const blocks = Markdown.parse(body);

  if (!edit.isEditable) {
    if (blocks.length === 0) {
      return null;
    }
    return (
      <div
        className={DISPLAY_READONLY_WRAPPER_CLASS_NAME}
        data-testid="markdown-body"
      >
        {blocks.map((block, i) => renderBlock(block, i, renderOptions))}
      </div>
    );
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: Markdown ブロック要素（h1 / ul / pre 等）を内包するため <button> は HTML 仕様上使えない。role="button" + tabIndex + onKeyDown で a11y を担保する。
    <div
      role="button"
      tabIndex={0}
      className={DISPLAY_EDITABLE_WRAPPER_CLASS_NAME}
      onClick={edit.handleDisplayClick}
      onKeyDown={edit.handleDisplayKeyDown}
      data-testid="markdown-body"
      aria-label="本文を編集する"
    >
      {blocks.length === 0 ? (
        <span className={PLACEHOLDER_CLASS_NAME}>本文を追加…</span>
      ) : (
        <div className="space-y-4">
          {blocks.map((block, i) => renderBlock(block, i, renderOptions))}
        </div>
      )}
    </div>
  );
};
