import { Milestone } from "@/domains/milestone";
import type { MilestonesResource } from "@/hooks/useMilestones";
import type { Task } from "@/types/task";
import { useMilestoneProgress } from "../../hooks/useMilestoneProgress";

type MilestoneViewScreenProps = {
  /** マイルストーンリソース（唯一の取得点から配る） */
  resource: MilestonesResource;
  /** 全タスク（進捗算出用） */
  tasks: Task[];
  /** done とみなすカラム名（既存 ProjectData.doneColumn 由来・未解決は undefined） */
  doneColumn: string | undefined;
};

/**
 * マイルストーン別ビュー（専用画面）。一覧 × 期日 × 進捗率を表示する。
 * 進捗率は done カラム所属割合。done カラム未解決時は進捗バーを出さない。
 * @param props - {@link MilestoneViewScreenProps}
 * @returns マイルストーンビュー要素
 */
export const MilestoneViewScreen = ({
  resource,
  tasks,
  doneColumn,
}: MilestoneViewScreenProps) => {
  const sorted = Milestone.sortByOrder(resource.milestones);
  const names = sorted.map((m) => m.name);
  const progress = useMilestoneProgress(names, tasks, doneColumn);

  if (resource.status === "loading" || resource.status === "idle") {
    return <p className="text-sm text-muted">読み込み中…</p>;
  }
  if (resource.status === "error") {
    return (
      <p className="text-sm text-muted">マイルストーンを読み込めませんでした</p>
    );
  }
  if (sorted.length === 0) {
    return <p className="text-sm text-muted">マイルストーンなし</p>;
  }

  return (
    <ul className="flex flex-col gap-3 p-4">
      {sorted.map((def) => {
        const p = progress.get(def.name);
        const state = Milestone.parseState(def.state);
        return (
          <li
            key={def.name}
            data-testid="milestone-view-row"
            className="flex flex-col gap-1 rounded border border-border p-3"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {Milestone.badgeLabel(def.name, def)}
              </span>
              {def.due !== undefined ? (
                <span className="text-sm text-muted">{def.due}</span>
              ) : null}
              <span className="text-xs text-muted">{state}</span>
              <span className="ml-auto text-sm text-muted">
                {p?.done ?? 0} / {p?.total ?? 0}
              </span>
            </div>
            {p?.ratio !== undefined ? (
              <div className="h-2 w-full rounded bg-surface-muted">
                <div
                  data-testid="milestone-progress-bar"
                  className="h-2 rounded bg-indigo-500"
                  style={{ width: `${Math.round(p.ratio * 100)}%` }}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
};
