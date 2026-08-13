import { useState } from "react";
import { EditableText } from "@/components/EditableText";
import type { SubIssueCounts } from "@/domains/task-projection";
import type { Task, TaskExtraValue } from "@/types/task";
import { CycleWarningBanner } from "../CycleWarningBanner";
import { MarkdownBody } from "../MarkdownBody";
import { ParseErrorBanner } from "../ParseErrorBanner";

const DetailTab = {
  Content: "content",
  SubIssues: "sub-issues",
  Raw: "raw",
} as const;

type DetailTab = (typeof DetailTab)[keyof typeof DetailTab];

/** 本文ペイン（Issue header + tabs + Markdown + activity）の Props */
export type DetailBodyProps = {
  /** 表示するタスク */
  task: Task;
  /** BE projection 由来のサブIssue完了数。未指定時は task の直接子件数のみ表示する。 */
  subIssueCounts?: SubIssueCounts;
  /**
   * タイトル確定ハンドラ
   * @param title - 確定したタイトル
   */
  onTitleConfirm: (title: string) => void;
  /**
   * 本文確定ハンドラ
   * @param body - 確定した本文
   */
  onBodyConfirm: (body: string) => void;
};

/**
 * JSON互換のextra値から表示用文字列だけを安全に取り出す。
 * @param value - Task extras の値
 * @returns 文字列ならその値、それ以外は undefined
 */
const extraString = (value: TaskExtraValue | undefined): string | undefined =>
  typeof value === "string" ? value : undefined;

/**
 * 詳細の本文ペイン。Issue header、本文タブ、Markdown、activity/comment の
 * presentational surfaceを束ね、編集処理は既存コールバックへ委譲する。
 * @param props - {@link DetailBodyProps}
 * @returns 本文ペイン要素
 */
export const DetailBody = ({
  task,
  subIssueCounts,
  onTitleConfirm,
  onBodyConfirm,
}: DetailBodyProps) => {
  const [activeTab, setActiveTab] = useState<DetailTab>(DetailTab.Content);
  const fileName = task.filePath.split("/").pop() ?? task.filePath;
  const author = extraString(task.extras.author) ?? "local user";
  const authorInitial = author.slice(0, 2).toUpperCase();
  const total = subIssueCounts?.total ?? task.hierarchy.childFilePaths.length;
  const done = subIssueCounts?.done ?? 0;

  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-4 flex flex-col gap-2">
        <CycleWarningBanner task={task} />
        <ParseErrorBanner task={task} />
      </div>

      <header
        data-testid="detail-issue-header"
        className="mb-[22px] border-b border-border pb-4"
      >
        <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-xs text-text-dim">{fileName}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-border bg-accent-soft px-2.5 py-1 text-[11.5px] font-semibold text-accent">
            <span
              aria-hidden="true"
              className="size-[7px] rounded-full bg-accent"
            />
            {task.status}
          </span>
          <span className="ml-auto text-[11.5px] text-text-dim">
            ローカル Markdown
          </span>
        </div>

        <div className="detail-title-row flex items-start gap-3">
          <EditableText
            key={`title-${task.id}`}
            value={task.title || task.filePath}
            onConfirm={onTitleConfirm}
            ariaLabel="タスクタイトル"
          />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex size-[18px] items-center justify-center rounded-full bg-accent text-[9px] font-semibold text-white">
              {authorInitial}
            </span>
            {author} が作成
          </span>
          {task.due !== undefined && <span>期限 {task.due}</span>}
          {total > 0 && (
            <span className="inline-flex items-center gap-2">
              <span>
                進捗 {done}/{total}
              </span>
              <span
                role="progressbar"
                aria-label={`進捗 ${done}/${total}`}
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={done}
                className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-muted"
              >
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{
                    width: `${total === 0 ? 0 : (done / total) * 100}%`,
                  }}
                />
              </span>
            </span>
          )}
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Issue内容"
        className="flex border-b border-border"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === DetailTab.Content}
          onClick={() => setActiveTab(DetailTab.Content)}
          className="border-b-2 border-transparent px-3.5 py-2 text-[12.5px] font-medium text-muted aria-selected:border-accent aria-selected:text-foreground"
        >
          内容
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === DetailTab.SubIssues}
          onClick={() => setActiveTab(DetailTab.SubIssues)}
          className="inline-flex items-center gap-1.5 border-b-2 border-transparent px-3.5 py-2 text-[12.5px] font-medium text-muted aria-selected:border-accent aria-selected:text-foreground"
        >
          サブIssue
          <span className="rounded-full border border-border bg-bg px-1.5 py-px font-mono text-[10.5px]">
            {total}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === DetailTab.Raw}
          onClick={() => setActiveTab(DetailTab.Raw)}
          className="border-b-2 border-transparent px-3.5 py-2 text-[12.5px] font-medium text-muted aria-selected:border-accent aria-selected:text-foreground"
        >
          Raw Markdown
        </button>
      </div>

      {activeTab === DetailTab.Content && (
        <>
          <div className="detail-markdown border-b border-border py-[18px]">
            <MarkdownBody
              key={`body-${task.id}`}
              body={task.body}
              onConfirm={onBodyConfirm}
            />
          </div>
          <section data-testid="detail-activity" className="py-[22px]">
            <h2 className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-foreground">
              アクティビティ
              <span className="font-mono text-[11px] font-normal text-text-dim">
                2
              </span>
            </h2>
            <ol className="relative ml-3.5 border-l border-border">
              <li className="relative pb-4 pl-7 text-[11.5px] text-muted">
                <span className="absolute -left-[9px] top-0.5 size-[17px] rounded-full border-2 border-accent bg-accent-soft" />
                <strong className="font-medium text-foreground">
                  {author}
                </strong>{" "}
                がステータスを{" "}
                <code className="rounded border border-border bg-bg px-1 py-px font-mono text-[11px]">
                  {task.status}
                </code>{" "}
                に設定
              </li>
              <li className="relative pl-7 text-[11.5px] text-muted">
                <span className="absolute -left-[9px] top-0.5 size-[17px] rounded-full border-2 border-border-strong bg-surface" />
                Markdown ファイルから読み込みました
              </li>
            </ol>

            <div className="mt-5 overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
              <div className="border-b border-border bg-surface-muted px-3 py-2 text-[11.5px] text-muted">
                コメント
              </div>
              <p className="px-3.5 py-4 text-[13px] text-text-dim">
                コメントはまだありません。
              </p>
            </div>

            <div
              data-testid="detail-comment-composer"
              className="mt-6 overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
            >
              <div className="border-b border-border bg-surface-muted px-3 py-2 text-xs font-medium">
                コメントを書く
              </div>
              <textarea
                readOnly
                aria-label="新しいコメント"
                placeholder="コメント機能は準備中です"
                className="min-h-24 w-full resize-y bg-surface px-4 py-3 font-mono text-[13px] outline-none"
              />
              <div className="flex justify-end border-t border-border bg-surface-muted px-3.5 py-2.5">
                <button
                  type="button"
                  disabled
                  className="h-7 rounded-md bg-accent px-3 text-xs font-medium text-white disabled:opacity-50"
                >
                  コメント
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      {activeTab === DetailTab.SubIssues && (
        <div role="tabpanel" className="py-8 text-center text-sm text-muted">
          サブIssueの詳細は右側のプロパティから確認できます（{done}/{total}）。
        </div>
      )}

      {activeTab === DetailTab.Raw && (
        <pre
          role="tabpanel"
          className="my-[18px] overflow-x-auto rounded-md bg-gray-900 p-3.5 font-mono text-xs leading-6 text-gray-100"
        >
          <code>{task.body}</code>
        </pre>
      )}
    </div>
  );
};
