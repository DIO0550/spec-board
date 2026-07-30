import type { MilestoneDefinition } from "@/domains/milestone";
import { Milestone } from "@/domains/milestone";
import type { MilestoneProjection } from "@/domains/milestone-projection";
import {
  TaskProjection,
  type TaskProjectionMap,
} from "@/domains/task-projection";
import { MilestoneCountdownBadge } from "@/features/milestoneView/components/MilestoneCountdownBadge";
import { MilestoneStateBadge } from "@/features/milestoneView/components/MilestoneStateBadge";
import {
  displayStatusLabel,
  formatDue,
  type MilestoneDisplayStatus,
  resolveCountdown,
} from "@/features/milestoneView/lib/milestoneStatus";
import type { Task } from "@/types/task";

type MilestoneDetailSidebarProps = {
  /** 表示対象のマイルストーン定義（未選択 = undefined） */
  def: MilestoneDefinition | undefined;
  /** 派生表示ステータス */
  status: MilestoneDisplayStatus | undefined;
  /** BE milestone projection */
  projection: MilestoneProjection | undefined;
  /** done column 解決済みで ratio を表示できるか。 */
  showRatio: boolean;
  /** マイルストーン名に紐づくタスク（一覧表示用） */
  tasks: readonly Task[];
  /** tasks と同一 snapshot の task projection map */
  taskProjections: TaskProjectionMap;
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
  projection,
  showRatio,
  tasks,
  taskProjections,
  now,
}: MilestoneDetailSidebarProps) => {
  if (def === undefined || status === undefined) {
    return (
      <aside className="hidden w-[320px] shrink-0 rounded-[10px] border border-dashed border-border bg-surface-muted p-6 text-center text-sm text-muted lg:flex lg:items-center lg:justify-center">
        マイルストーンを選択すると詳細を表示します
      </aside>
    );
  }
  const title = Milestone.badgeLabel(def.name, def);
  const countdown = resolveCountdown(def, now);
  return (
    <aside className="hidden w-[320px] shrink-0 flex-col gap-3 lg:flex">
      <section className="flex flex-col gap-3 rounded-[10px] border border-border bg-surface p-4">
        <header className="flex items-start gap-3">
          <MilestoneStateBadge status={status} />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-sm font-semibold text-foreground">
              {title}
            </span>
            <span className="font-mono text-[10.5px] text-muted">
              {def.name}
            </span>
          </div>
        </header>
        <dl className="grid grid-cols-[80px_1fr] items-center gap-x-3 gap-y-2 text-xs">
          <dt className="text-muted">状態</dt>
          <dd className="text-foreground">{displayStatusLabel(status)}</dd>
          <dt className="text-muted">期日</dt>
          <dd className="flex items-center gap-2">
            {(() => {
              // parseDue 検証通過のみ YYYY-MM-DD で表示。不正値は「未設定」へ倒し
              // CountdownBadge の "期日未設定" 表示と整合させる。
              const dueLabel = formatDue(def.due);
              return dueLabel !== undefined ? (
                <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11px]">
                  {dueLabel}
                </code>
              ) : (
                <span className="text-muted">未設定</span>
              );
            })()}
            <MilestoneCountdownBadge countdown={countdown} />
          </dd>
          {projection !== undefined ? (
            <>
              <dt className="text-muted">タスク</dt>
              <dd className="font-mono text-foreground">
                {projection.done} / {projection.total}
                {showRatio && projection.total > 0
                  ? ` (${Math.round((projection.done / projection.total) * 100)}%)`
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

      <section className="flex flex-col gap-2 rounded-[10px] border border-border bg-surface p-4">
        <header className="text-[10.5px] font-semibold uppercase tracking-wider text-muted">
          所属タスク（{tasks.length}）
        </header>
        {tasks.length === 0 ? (
          <p className="text-xs text-muted">タスクなし</p>
        ) : (
          <ul className="flex flex-col">
            {tasks.map((t) => {
              const isDone = TaskProjection.findByFilePath(
                taskProjections,
                t.filePath,
              ).isDone;
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
                  <span className="font-mono text-[11px] text-muted">
                    {t.id}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-xs ${
                      isDone ? "text-muted line-through" : "text-foreground"
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
