import type { Column, Task } from "../types/task";
import { initialColumns, initialTasks } from "./mock-data";

const tasks = structuredClone(initialTasks);
let columns = structuredClone(initialColumns);
let cardOrder: Record<string, string[]> = buildCardOrder(tasks, columns);

/**
 * ステータスが既存カラムに存在するか検証する
 * @param status - 検証対象のステータス文字列
 * @throws ステータスが既存カラムに存在しない場合
 */
function validateStatus(status: string): void {
	if (!columns.some((col) => col.name === status)) {
		throw new Error(
			`Invalid status: ${status}. Must be one of: ${columns.map((c) => c.name).join(", ")}`,
		);
	}
}

/**
 * カラムごとのカード表示順を構築する
 * @param taskList - タスク一覧
 * @param columnList - カラム一覧
 * @returns カラム名をキー、ファイルパス配列を値とするオブジェクト
 */
function buildCardOrder(
	taskList: Task[],
	columnList: Column[],
): Record<string, string[]> {
	const order: Record<string, string[]> = {};
	for (const col of columnList) {
		order[col.name] = taskList
			.filter((t) => t.status === col.name)
			.map((t) => t.filePath);
	}
	return order;
}

let nextId = tasks.length + 1;

/**
 * 全タスクを取得する
 * @returns タスクの配列
 */
export async function getTasks(): Promise<Task[]> {
	return structuredClone(tasks);
}

/**
 * 全カラムを取得する
 * @returns カラムの配列
 */
export async function getColumns(): Promise<Column[]> {
	return structuredClone(columns);
}

/**
 * 新しいタスクを作成する
 * @param params - タスクの作成パラメータ（title, status は必須）
 * @returns 作成されたタスク
 */
export async function createTask(
	params: Pick<Task, "title" | "status"> &
		Partial<Omit<Task, "id" | "title" | "status">>,
): Promise<Task> {
	validateStatus(params.status);
	if (params.parent !== undefined) {
		const parentExists = tasks.some((t) => t.filePath === params.parent);
		if (!parentExists) {
			throw new Error(`Parent task not found: ${params.parent}`);
		}
	}
	const newTask: Task = {
		id: `task-${nextId++}`,
		title: params.title,
		status: params.status,
		priority: params.priority,
		labels: params.labels ?? [],
		parent: params.parent,
		links: params.links ?? [],
		children: params.children ?? [],
		reverseLinks: params.reverseLinks ?? [],
		body: params.body ?? "",
		filePath: params.filePath ?? `tasks/${params.title}.md`,
	};
	tasks.push(newTask);
	const col = cardOrder[newTask.status];
	if (col) {
		col.push(newTask.filePath);
	}
	if (newTask.parent !== undefined) {
		const parentTask = tasks.find((t) => t.filePath === newTask.parent);
		if (parentTask && !parentTask.children.includes(newTask.filePath)) {
			parentTask.children = [...parentTask.children, newTask.filePath];
		}
	}
	return structuredClone(newTask);
}

/**
 * タスクを部分更新する
 * @param id - 更新対象のタスクID
 * @param updates - 更新するフィールド
 * @throws タスクが見つからない場合
 * @returns 更新後のタスク
 */
export async function updateTask(
	id: string,
	updates: Partial<Omit<Task, "id">>,
): Promise<Task> {
	const index = tasks.findIndex((t) => t.id === id);
	if (index === -1) {
		throw new Error(`Task not found: ${id}`);
	}
	if (updates.status) {
		validateStatus(updates.status);
	}
	const oldStatus = tasks[index].status;
	const oldFilePath = tasks[index].filePath;
	tasks[index] = { ...tasks[index], ...updates };
	const updated = tasks[index];

	const statusChanged = updated.status !== oldStatus;
	const filePathChanged = updated.filePath !== oldFilePath;
	if (statusChanged || filePathChanged) {
		cardOrder = buildCardOrder(tasks, columns);
	}

	return structuredClone(updated);
}

/**
 * タスクを削除する
 * @param id - 削除対象のタスクID
 * @throws タスクが見つからない場合
 */
export async function deleteTask(id: string): Promise<void> {
	const index = tasks.findIndex((t) => t.id === id);
	if (index === -1) {
		throw new Error(`Task not found: ${id}`);
	}
	const removed = tasks[index];
	tasks.splice(index, 1);
	const col = cardOrder[removed.status];
	if (col) {
		const pos = col.indexOf(removed.filePath);
		if (pos !== -1) col.splice(pos, 1);
	}
}

/** カラム名変更の指定 */
export type ColumnRename = {
	/** 元のカラム名 */
	from: string;
	/** 新しいカラム名 */
	to: string;
};

/**
 * カラム定義を更新する
 * @param newColumns - 新しいカラム定義の配列
 * @param renames - カラム名変更の配列。指定時は該当タスクの status を一括更新する
 * @returns 更新後のカラム配列
 */
export async function updateColumns(
	newColumns: Column[],
	renames?: ColumnRename[],
): Promise<Column[]> {
	if (renames && renames.length > 0) {
		const renameMap = new Map(renames.map((r) => [r.from, r.to]));
		for (const task of tasks) {
			const next = renameMap.get(task.status);
			if (next !== undefined) {
				task.status = next;
			}
		}
	}
	columns = structuredClone(newColumns);
	cardOrder = buildCardOrder(tasks, columns);
	return structuredClone(columns);
}

/**
 * カード表示順を更新する
 * @param newCardOrder - 新しいカード表示順
 * @returns 更新後のカード表示順
 */
export async function updateCardOrder(
	newCardOrder: Record<string, string[]>,
): Promise<Record<string, string[]>> {
	cardOrder = structuredClone(newCardOrder);
	return structuredClone(cardOrder);
}
