import { TaskSelect } from "@/components/TaskSelect";
import { LabelChip } from "@/features/task-form/components/TaskForm/LabelChip";
import type { Task } from "@/types/task";

/** TaskFormLinks の Props */
export type TaskFormLinksProps = {
  /** 選択済み関連タスクの filePath 一覧 */
  links: string[];
  /** links の各 filePath を existingTasks から逆引きした Task（chip の title 表示用） */
  selectedTasks: Task[];
  /** 追加ピッカーの候補（parent / 選択済みを除外済み） */
  candidates: Task[];
  /**
   * 関連タスク追加時のコールバック。
   * @param filePath - 追加する関連タスクの filePath
   */
  onAdd: (filePath: string) => void;
  /**
   * 関連タスク削除時のコールバック。
   * @param filePath - 削除対象の filePath
   */
  onRemove: (filePath: string) => void;
  /** 無効化（送信中など）。chip 削除とピッカーの両方に伝播する */
  disabled?: boolean;
};

/**
 * 関連タスク（links）入力 UI。選択済みを chip で表示し、追加はタスクピッカーで行う
 * ハイブリッド。chip ラベルは filePath を title に逆引きして表示する。
 * @param props - {@link TaskFormLinksProps}
 * @returns links 入力 UI
 */
export const TaskFormLinks = (props: TaskFormLinksProps) => {
  const disabled = props.disabled ?? false;

  /**
   * filePath を Task.title に逆引きする。逆引き失敗時は filePath を fallback 表示する。
   * @param filePath - 解決対象の filePath
   * @returns title または filePath
   */
  const titleOf = (filePath: string): string =>
    props.selectedTasks.find((task) => task.filePath === filePath)?.title ??
    filePath;

  return (
    <div>
      {props.links.length > 0 && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {props.links.map((filePath) => (
            <LabelChip
              key={filePath}
              label={titleOf(filePath)}
              title={filePath}
              removeAriaLabel={`関連タスク「${titleOf(filePath)}」を削除`}
              disabled={disabled}
              onRemove={() => props.onRemove(filePath)}
            />
          ))}
        </div>
      )}
      <TaskSelect
        tasks={props.candidates}
        value={null}
        label="関連タスク"
        placeholder="関連タスクを検索して追加"
        testIdPrefix="task-form-links"
        disabled={disabled || props.candidates.length === 0}
        onChange={(filePath) => {
          if (filePath !== null) {
            props.onAdd(filePath);
          }
        }}
      />
    </div>
  );
};
