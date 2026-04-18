import { beforeEach, expect, test, vi } from "vitest";
import type {
	createTask as CreateTask,
	deleteTask as DeleteTask,
	getColumns as GetColumns,
	getTasks as GetTasks,
	updateCardOrder as UpdateCardOrder,
	updateColumns as UpdateColumns,
	updateTask as UpdateTask,
} from "@/lib/api";

let getTasks: typeof GetTasks;
let getColumns: typeof GetColumns;
let createTask: typeof CreateTask;
let updateTask: typeof UpdateTask;
let deleteTask: typeof DeleteTask;
let updateColumns: typeof UpdateColumns;
let updateCardOrder: typeof UpdateCardOrder;

beforeEach(async () => {
	vi.resetModules();
	const api = await import("@/lib/api");
	getTasks = api.getTasks;
	getColumns = api.getColumns;
	createTask = api.createTask;
	updateTask = api.updateTask;
	deleteTask = api.deleteTask;
	updateColumns = api.updateColumns;
	updateCardOrder = api.updateCardOrder;
});

test("getTasks がモックタスクの配列を返す", async () => {
	const tasks = await getTasks();
	expect(tasks.length).toBe(5);
	expect(tasks[0].title).toBe("ログイン画面のバグ修正");
});

test("getColumns がデフォルトカラム3つを返す", async () => {
	const columns = await getColumns();
	expect(columns).toHaveLength(3);
	expect(columns.map((c) => c.name)).toEqual(["Todo", "In Progress", "Done"]);
});

test("createTask が新しいタスクを返す", async () => {
	const created = await createTask({
		title: "New Task",
		status: "Todo",
		priority: "Medium",
	});
	expect(created.id).toBe("task-6");
	expect(created.title).toBe("New Task");
	expect(created.status).toBe("Todo");
	expect(created.priority).toBe("Medium");
	expect(created.labels).toEqual([]);

	const tasks = await getTasks();
	expect(tasks).toHaveLength(6);
});

test("createTask で存在しないステータスを指定するとエラーになる", async () => {
	await expect(
		createTask({ title: "Bad Task", status: "NonExistent" }),
	).rejects.toThrow("Invalid status: NonExistent");
});

test("updateTask で一部フィールドのみ更新できる", async () => {
	const updated = await updateTask("task-1", {
		title: "Updated Title",
		priority: "Low",
	});
	expect(updated.title).toBe("Updated Title");
	expect(updated.priority).toBe("Low");
	expect(updated.status).toBe("Todo");
});

test("updateTask で存在しないタスクIDを指定するとエラーになる", async () => {
	await expect(updateTask("non-existent", { title: "Fail" })).rejects.toThrow(
		"Task not found: non-existent",
	);
});

test("updateTask で存在しないステータスを指定するとエラーになる", async () => {
	await expect(
		updateTask("task-1", { status: "InvalidStatus" }),
	).rejects.toThrow("Invalid status: InvalidStatus");
});

test("updateTask でステータス変更時にcardOrderが正しく更新される", async () => {
	await updateTask("task-1", { status: "In Progress" });
	const tasks = await getTasks();
	const updated = tasks.find((t) => t.id === "task-1");
	expect(updated?.status).toBe("In Progress");
});

test("deleteTask で指定タスクが削除される", async () => {
	await deleteTask("task-1");
	const tasks = await getTasks();
	expect(tasks).toHaveLength(4);
	expect(tasks.find((t) => t.id === "task-1")).toBeUndefined();
});

test("deleteTask で存在しないタスクIDを指定するとエラーになる", async () => {
	await expect(deleteTask("non-existent")).rejects.toThrow(
		"Task not found: non-existent",
	);
});

test("createTask で parent を指定すると親タスクの children が更新される", async () => {
	const tasks = await getTasks();
	const parentFilePath = tasks[0].filePath;
	const created = await createTask({
		title: "Child Task",
		status: "Todo",
		parent: parentFilePath,
	});
	expect(created.parent).toBe(parentFilePath);

	const updatedTasks = await getTasks();
	const parent = updatedTasks.find((t) => t.filePath === parentFilePath);
	expect(parent?.children).toContain(created.filePath);
});

test("createTask で存在しない parent を指定するとエラーになる", async () => {
	await expect(
		createTask({
			title: "Orphan Task",
			status: "Todo",
			parent: "tasks/does-not-exist.md",
		}),
	).rejects.toThrow("Parent task not found: tasks/does-not-exist.md");
});

test("createTask でタイトルが日本語でも動作する", async () => {
	const created = await createTask({
		title: "タスク作成テスト",
		status: "Todo",
	});
	expect(created.title).toBe("タスク作成テスト");
	expect(created.filePath).toBe("tasks/タスク作成テスト.md");
});

test("updateColumns でカラム定義を更新できる", async () => {
	const newColumns = [
		{ name: "Backlog", order: 0 },
		{ name: "In Progress", order: 1 },
		{ name: "Review", order: 2 },
		{ name: "Done", order: 3 },
	];
	const result = await updateColumns(newColumns);
	expect(result).toHaveLength(4);
	expect(result.map((c) => c.name)).toEqual([
		"Backlog",
		"In Progress",
		"Review",
		"Done",
	]);

	const columns = await getColumns();
	expect(columns).toHaveLength(4);
});

test("updateColumns で renames を渡すと該当タスクの status が一括更新される", async () => {
	const before = await getTasks();
	const todoTaskIds = before
		.filter((t) => t.status === "Todo")
		.map((t) => t.id);
	expect(todoTaskIds.length).toBeGreaterThan(0);

	const newColumns = [
		{ name: "Backlog", order: 0 },
		{ name: "In Progress", order: 1 },
		{ name: "Done", order: 2 },
	];
	await updateColumns(newColumns, [{ from: "Todo", to: "Backlog" }]);

	const after = await getTasks();
	for (const id of todoTaskIds) {
		expect(after.find((t) => t.id === id)?.status).toBe("Backlog");
	}
	expect(after.some((t) => t.status === "Todo")).toBe(false);
});

test("updateCardOrder でカード表示順を更新できる", async () => {
	const newOrder = {
		Todo: ["tasks/fix-login-bug.md"],
		"In Progress": [],
		Done: [],
	};
	const result = await updateCardOrder(newOrder);
	expect(result.Todo).toEqual(["tasks/fix-login-bug.md"]);
	expect(result["In Progress"]).toEqual([]);
});
