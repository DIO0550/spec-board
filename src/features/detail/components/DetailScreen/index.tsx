import { useEffect, useMemo, useRef, useState } from "react";
import { getBrokenLinks } from "@/domains/broken-link";
import { useChildTasks } from "@/features/detail/hooks/useChildTasks";
import { useDetailFieldHandlers } from "@/features/detail/hooks/useDetailFieldHandlers";
import { useEscToClose } from "@/features/detail/hooks/useEscToClose";
import { useParentTask } from "@/features/detail/hooks/useParentTask";
import type { OrphanStrategy } from "@/lib/tauri";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";
import type { Result } from "@/utils/result";
import { DetailBody } from "../DetailBody";
import { PropertiesSidebar } from "../PropertiesSidebar";

/** 全画面2ペイン詳細ビューの Props */
export type DetailScreenProps = {
  /** 表示するタスク */
  task: Task;
  /** 選択肢となるカラム一覧 */
  columns: Column[];
  /** 全タスク一覧。サブIssue / Links セクションの解決に利用する */
  allTasks?: Task[];
  /** 完了として扱うカラム名。サブIssue の完了判定に使用 */
  doneColumn?: string;
  /**
   * 「正規化済み Task.filePath → Task」の lookup Map。
   * 渡された場合のみ broken link 判定を行う。
   */
  tasksByNormalizedPath?: ReadonlyMap<string, Task>;
  /** ボードへ戻るハンドラ（← 戻るボタン / Esc 共通） */
  onBack: () => void;
  /**
   * 上位モーダル（タスク作成モーダル等）の表示中フラグ。
   * true の間は DetailScreen の Esc（戻る）を停止し、上位モーダル側の Esc と
   * 競合（戻る誤発火）しないようにする。
   */
  isUpperModalOpen?: boolean;
  /**
   * タスク更新時のコールバック
   * @param id - 更新対象のタスクID
   * @param updates - 更新するフィールド
   */
  onTaskUpdate: (id: string, updates: Partial<Omit<Task, "id">>) => void;
  /**
   * タスク削除時のコールバック
   * @param id - 削除対象のタスクID
   * @param orphanStrategy - 子タスクがある場合の処理方針（子なし時は未指定）
   */
  onDelete: (
    id: string,
    orphanStrategy?: OrphanStrategy,
  ) => void | Promise<void>;
  /**
   * サブIssue 追加ボタン押下時のコールバック。
   * @param parentFilePath - 親タスクのファイルパス
   */
  onAddSubIssue?: (parentFilePath: string) => void;
  /**
   * 別のタスクへ表示対象を切り替えるコールバック。
   * @param taskId - 切り替え先タスクの id
   */
  onSelectTask?: (taskId: string) => void;
  /**
   * リンク追加コールバック。
   * @param sourceFilePath リンク元 filePath
   * @param targetFilePath リンク先 filePath
   * @returns invoke 結果
   */
  onAddLink?: (
    sourceFilePath: string,
    targetFilePath: string,
  ) => Promise<Result<Task, unknown>>;
  /**
   * リンク削除コールバック。
   * @param sourceFilePath リンク元 filePath
   * @param targetFilePath リンク先 filePath
   * @returns invoke 結果
   */
  onRemoveLink?: (
    sourceFilePath: string,
    targetFilePath: string,
  ) => Promise<Result<Task, unknown>>;
};

/**
 * 全画面2ペイン詳細ビュー。左=本文（DetailBody）/ 右=プロパティサイドバー（PropertiesSidebar）。
 * `<main>` を占有する feature コンポーネント（SettingsScreen 同様の全画面区分）。
 * Esc / 「← 戻る」で board へ戻る。useChildTasks / useParentTask / getBrokenLinks /
 * useDetailFieldHandlers をコンテナとして呼び、計算済みの値・ハンドラを共通部品へ渡す。
 * @param props - {@link DetailScreenProps}
 * @returns 全画面詳細ビュー要素
 */
export const DetailScreen = (props: DetailScreenProps) => {
  const {
    task,
    columns,
    allTasks,
    doneColumn,
    tasksByNormalizedPath,
    onBack,
    onTaskUpdate,
    onDelete,
    onAddSubIssue,
    onSelectTask,
    onAddLink,
    onRemoveLink,
    isUpperModalOpen = false,
  } = props;

  const childInfo = useChildTasks({
    parentFilePath: task.filePath,
    allTasks,
    columns,
    doneColumn,
  });
  const { parentTask } = useParentTask({ task, allTasks });
  const fieldHandlers = useDetailFieldHandlers(task, onTaskUpdate);
  const brokenLinks = useMemo(
    () => getBrokenLinks(task, tasksByNormalizedPath),
    [task, tasksByNormalizedPath],
  );

  // 削除 ConfirmDialog 表示中は Esc を「戻る」に使わない。PropertiesSidebar から
  // 開閉通知を受けて disabled に反映する。
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // 削除ダイアログ または 上位モーダル（作成モーダル等）表示中は Esc（戻る）を停止し、
  // モーダル自身の Esc と競合（戻る誤発火）しないようにする。
  const escSuspended = isDeleteDialogOpen || isUpperModalOpen;

  // 全画面ビュー展開時に section 自身へフォーカスを移す（ビュー先頭へ移動）。
  // DetailScreen は modal ではなく、HeaderBar / AppSidebar が detail 区分でも常時
  // 操作可能なため focus trap は適用しない（キーボードでヘッダ/サイドバーへ到達できるようにする）。
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    sectionRef.current?.focus();
  }, []);

  useEscToClose({ disabled: escSuspended, onEscape: onBack });

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-label="タスク詳細"
      className="flex flex-1 flex-col overflow-hidden focus:outline-none md:flex-row"
    >
      <h1 className="sr-only">{task.title || task.filePath}</h1>
      <div className="flex flex-1 flex-col overflow-y-auto p-4 md:p-6">
        <button
          type="button"
          data-testid="detail-back-button"
          className="mb-4 inline-flex w-fit items-center gap-1 rounded px-2 py-1 text-sm text-muted hover:bg-surface-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
          onClick={onBack}
        >
          ← 戻る
        </button>
        <DetailBody
          task={task}
          onTitleConfirm={(title) => onTaskUpdate(task.id, { title })}
          onBodyConfirm={(body) => onTaskUpdate(task.id, { body })}
        />
      </div>
      <div className="w-full shrink-0 overflow-y-auto border-t border-border p-4 md:w-[360px] md:border-t-0 md:border-l md:p-6">
        <PropertiesSidebar
          task={task}
          columns={columns}
          allTasks={allTasks}
          childInfo={childInfo}
          parentTask={parentTask}
          brokenLinks={brokenLinks}
          handlers={fieldHandlers}
          onAddSubIssue={onAddSubIssue}
          onSelectTask={onSelectTask}
          onAddLink={onAddLink}
          onRemoveLink={onRemoveLink}
          onDelete={onDelete}
          onDeleteFlowOpenChange={setDeleteDialogOpen}
        />
      </div>
    </section>
  );
};
