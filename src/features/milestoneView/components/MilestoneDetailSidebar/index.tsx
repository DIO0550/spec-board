import type { MilestoneDefinition } from "@/domains/milestone";
import { Milestone } from "@/domains/milestone";
import { MilestoneCountdownBadge } from "@/features/milestoneView/components/MilestoneCountdownBadge";
import { MilestoneStateBadge } from "@/features/milestoneView/components/MilestoneStateBadge";
import type { MilestoneProgress } from "@/features/milestoneView/hooks/useMilestoneProgress";
import {
  type MilestoneDisplayStatus,
  resolveCountdown,
} from "@/features/milestoneView/lib/milestoneStatus";
import type { Task } from "@/types/task";

type MilestoneDetailSidebarProps = {
  /** 表示対象のマイルストーン定義（未選択 = undefined） */
  def: MilestoneDefinition | undefined;
  /** 派生表示ステータス */
  status: MilestoneDisplayStatus | undefined;
  /** 進捗 */
  progress: MilestoneProgress | undefined;
  /** マイルストーン名に紐づくタスク（一覧表示用） */
  tasks: readonly Task[];
  /** done 判定用カラム名（未解決は undefined） */
  doneColumn: string | undefined;
  /** 現在時刻（テスト差し替え用） */
  now?: Date;
};

/**
 * 右サイドバー: 選択中マイルストーンのメタ情報（状態 / 期日 / 説明）と所属タスクを表示。
 * 未選択時は空メッセージ。design-source: `.side-card`（overview + task-list 部分）。
 * @param props - {@link MilestoneDetailSidebarProps}
 * @returns サイドバー要素
 */
export const MilestoneDetailSidebar = ({
  def,
  status,
  progress,
  tasks,
  doneColumn,
  now,
}: MilestoneDetailSidebarProps) => {
  if (def === undefined || status === undefined) {
    return (
      <aside className="hidden w-[320px] shrink-0 rounded-[10px] border border-dashed border-border bg-panel-2 p-6 text-center text-sm text-muted lg:flex lg:items-center lg:justify-center">
        マイルストーンを選択すると詳細を表示します
      </aside>
    );
  }
  const title = Milestone.badgeLabel(def.name, def);
  const countdown = resolveCountdown(def, now);
  return (
    <aside className="hidden w-[320px] shrink-0 flex-col gap-3 lg:flex">
      <section className="flex flex-col gap-3 rounded-[10px] border border-border bg-panel p-4">
        <header className="flex items-start gap-3">
          <MilestoneStateBadge status={status} />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-sm font-semibold text-foreground">
              {title}
            </span>
            <span className="font-mono text-[10.5px] text-text-dim">
              {def.name}
            </span>
          </div>
        </header>
        <dl className="grid grid-cols-[80px_1fr] items-center gap-x-3 gap-y-2 text-xs">
          <dt className="text-text-dim">状態</dt>
          <dd className="text-foreground">{status}</dd>
          <dt className="text-text-dim">期日</dt>
          <dd className="flex items-center gap-2">
            {def.due !== undefined ? (
              <code className="rounded bg-panel-2 px-1 py-0.5 font-mono text-[11px]">
                {def.due}
              </code>
            ) : (
              <span className="text-text-dim">未設定</span>
            )}
            <MilestoneCountdownBadge countdown={countdown} />
          </dd>
          {progress !== undefined ? (
            <>
              <dt className="text-text-dim">タスク</dt>
              <dd className="font-mono text-foreground">
                {progress.done} / {progress.total}
                {progress.ratio !== undefined
                  ? ` (${Math.round(progress.ratio * 100)}%)`
                  : ""}
              </dd>
            </>
          ) : null}
        </dl>
        {def.description !== undefined && def.description.length > 0 ? (
          <p className="text-xs leading-relaxed text-muted">
            {def.description}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-2 rounded-[10px] border border-border bg-panel p-4">
        <header className="text-[10.5px] font-semibold uppercase tracking-wider text-text-dim">
          所属タスク（{tasks.length}）
        </header>
        {tasks.length === 0 ? (
          <p className="text-xs text-text-dim">タスクなし</p>
        ) : (
          <ul className="flex flex-col">
            {tasks.map((t) => {
              const isDone =
                doneColumn !== undefined && t.status === doneColumn;
              return (
                <li
                  key={t.id}
                  data-testid="milestone-sidebar-task"
                  className="flex items-center gap-2 border-t border-border py-1.5 first:border-t-0"
                >
                  <span
                    aria-hidden="true"
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      isDone
                        ? "bg-[var(--color-ms-success)]"
                        : "bg-[var(--color-ms-todo)]"
                    }`}
                  />
                  <span className="font-mono text-[11px] text-text-dim">
                    {t.id}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-xs ${
                      isDone ? "text-text-dim line-through" : "text-foreground"
                    }`}
                  >
                    {t.title}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
};
