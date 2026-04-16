import type { MouseEvent } from "react";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import type { Task } from "../../../types/task";
import { ColumnContextMenu } from "./ColumnContextMenu";
import { ColumnHeader } from "./ColumnHeader";
import { TaskCard } from "./TaskCard";

/** 個別カラムの Props */
type ColumnProps = {
	/** ステータス名 */
	name: string;
	/** カラムに属するタスクの配列 */
	tasks: Task[];
	/** 全タスクの配列（子タスク解決用） */
	allTasks?: Task[];
	/** 完了カラム名 */
	doneColumn?: string;
	/** 「+ 追加」ボタンクリック時のコールバック */
	onAddClick: () => void;
	/**
	 * タスクカードクリック時のコールバック
	 * @param taskId - クリックされたタスクのID
	 */
	onTaskClick?: (taskId: string) => void;
	/**
	 * カラム名リネーム確定時のコールバック。
	 * 未指定の場合はヘッダー名編集 UI を無効化する。
	 * @param newName - 新しいカラム名（trim 済み、既存と非重複）
	 */
	onRename?: (newName: string) => void;
	/** 他カラム名の一覧（重複チェック用。自身は含まない） */
	existingColumnNames?: string[];
	/**
	 * カラム削除確定時のコールバック。
	 * 未指定の場合は削除 UI を無効化する。
	 * @param destColumn - タスクの移動先カラム名。タスクが 0 件の場合は undefined
	 */
	onDelete?: (destColumn: string | undefined) => void;
	/** 削除操作を許可するか（false の場合は右クリックメニューの削除が無効化） */
	canDelete?: boolean;
};

/**
 * ステータス別の個別カラムを表示する
 * @param props - {@link ColumnProps}
 * @returns カラム要素
 */
export function Column({
	name,
	tasks,
	allTasks = [],
	doneColumn,
	onAddClick,
	onTaskClick,
	onRename,
	existingColumnNames,
	onDelete,
	canDelete = true,
}: ColumnProps) {
	const tasksByFilePath = useMemo(
		() => new Map(allTasks.map((t) => [t.filePath, t])),
		[allTasks],
	);

	const otherColumnNames = existingColumnNames ?? [];
	const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
	const [isConfirming, setIsConfirming] = useState(false);
	const [destColumn, setDestColumn] = useState<string>("");

	const handleContextMenu = onDelete
		? (e: MouseEvent<HTMLDivElement>) => {
				e.preventDefault();
				setMenuPos({ x: e.clientX, y: e.clientY });
			}
		: undefined;

	const handleDeleteClick = () => {
		setDestColumn(otherColumnNames[0] ?? "");
		setIsConfirming(true);
	};

	const handleConfirm = () => {
		const hasTasks = tasks.length > 0;
		onDelete?.(hasTasks ? destColumn : undefined);
		setIsConfirming(false);
	};

	const handleCancel = () => {
		setIsConfirming(false);
	};

	const hasTasks = tasks.length > 0;
	const confirmDisabled = hasTasks && destColumn === "";

	return (
		<section
			className="flex h-full w-72 min-w-72 flex-col rounded-lg bg-gray-50"
			aria-label={name}
		>
			<ColumnHeader
				name={name}
				taskCount={tasks.length}
				onAddClick={onAddClick}
				onRename={onRename}
				existingColumnNames={existingColumnNames}
				onContextMenu={handleContextMenu}
			/>
			<ul className="flex-1 overflow-y-auto px-2 pb-2">
				{tasks.map((task) => {
					const childTasks = task.children
						.map((fp) => tasksByFilePath.get(fp))
						.filter((t): t is Task => t !== undefined);
					return (
						<li key={task.id} className="mb-2">
							<TaskCard
								task={task}
								childTasks={childTasks}
								doneColumn={doneColumn}
								onClick={onTaskClick}
							/>
						</li>
					);
				})}
			</ul>
			{menuPos && (
				<ColumnContextMenu
					x={menuPos.x}
					y={menuPos.y}
					canDelete={canDelete}
					onDelete={handleDeleteClick}
					onClose={() => setMenuPos(null)}
				/>
			)}
			{isConfirming && (
				<ConfirmDialog
					title="カラムを削除"
					message={
						hasTasks
							? `「${name}」には ${tasks.length} 件のタスクがあります。移動先を選択してください。`
							: `「${name}」を削除します。よろしいですか？`
					}
					confirmLabel="削除"
					confirmDisabled={confirmDisabled}
					onConfirm={handleConfirm}
					onCancel={handleCancel}
				>
					{hasTasks && otherColumnNames.length > 0 && (
						<label className="mt-4 block text-sm text-gray-700">
							移動先カラム
							<select
								value={destColumn}
								onChange={(e) => setDestColumn(e.target.value)}
								className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
								data-testid="column-delete-destination"
							>
								{otherColumnNames.map((n) => (
									<option key={n} value={n}>
										{n}
									</option>
								))}
							</select>
						</label>
					)}
				</ConfirmDialog>
			)}
		</section>
	);
}
