import { EditableText } from "@/components/EditableText";
import { Task } from "@/domains/task";
import { CycleWarningBanner } from "../CycleWarningBanner";
import { MarkdownBody } from "../MarkdownBody";
import { ParseErrorBanner } from "../ParseErrorBanner";

/** 本文ペイン（タイトル + Markdown 本文 + 本文関連バナー）の Props */
export type DetailBodyProps = {
  /** 表示するタスク */
  task: Task;
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
 * 詳細の本文ペイン。DetailScreen の左ペイン専用。
 * タイトル編集 + Markdown 本文 + 本文関連バナー（循環 / パースエラー）を束ねる。
 * ParentLink / BrokenParentRow は本文には含めず、右の PropertiesSidebar に集約する
 * （Parent / Links はサイドバー集約というユーザー決定に従う）。
 * @param props - {@link DetailBodyProps}
 * @returns 本文ペイン要素
 */
export const DetailBody = (props: DetailBodyProps) => {
  const { task, onTitleConfirm, onBodyConfirm } = props;

  return (
    <div className="flex flex-col gap-4">
      <CycleWarningBanner task={task} />
      <ParseErrorBanner task={task} />
      {/* key は task 切替時に編集 state をリセットするための再マウント用。 */}
      {/* EditableText と MarkdownBody は同じ親の兄弟のため、key 衝突（重複 key で */}
      {/* 旧要素が残留する）を避けて要素ごとに名前空間を付与する。 */}
      <EditableText
        key={`title-${task.id}`}
        value={Task.displayTitle(task)}
        onConfirm={onTitleConfirm}
        ariaLabel="タスクタイトル"
      />
      <MarkdownBody
        key={`body-${task.id}`}
        body={task.body}
        onConfirm={onBodyConfirm}
      />
    </div>
  );
};
