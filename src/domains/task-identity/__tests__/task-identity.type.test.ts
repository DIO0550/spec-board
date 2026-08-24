import type { TaskFilePath, TaskId } from "@/domains/task-identity";
import type { AddLinkParams } from "@/lib/tauri/linkCommands/types";
import type {
  DeleteTaskParams,
  MoveTaskParams,
  UpdateTaskParams,
} from "@/lib/tauri/taskCommands/types";
import { Task } from "@/types/task";
import { expectTypeOf, test } from "vitest";

test("TaskIdとTaskFilePathは相互代入できずstringへだけ拡張できる", () => {
  const taskId = "task-id" as TaskId;
  const filePath = "tasks/task-id.md" as TaskFilePath;

  expectTypeOf<string>(taskId).toBeString();
  expectTypeOf<string>(filePath).toBeString();

  // @ts-expect-error TaskIdはcanonical file pathとして扱えない。
  const pathFromId: TaskFilePath = taskId;
  // @ts-expect-error TaskFilePathはTaskの選択IDとして扱えない。
  const idFromPath: TaskId = filePath;
  // @ts-expect-error raw stringはadapter境界を通さずTaskIdへ代入できない。
  const idFromRaw: TaskId = "task-id";
  // @ts-expect-error raw stringはadapter境界を通さずTaskFilePathへ代入できない。
  const pathFromRaw: TaskFilePath = "tasks/task-id.md";

  expectTypeOf(pathFromId).toEqualTypeOf<TaskFilePath>();
  expectTypeOf(idFromPath).toEqualTypeOf<TaskId>();
  expectTypeOf(idFromRaw).toEqualTypeOf<TaskId>();
  expectTypeOf(pathFromRaw).toEqualTypeOf<TaskFilePath>();
});

test("mutation DTOはTaskFilePathだけをcanonical pathとして受け取る", () => {
  const task = Task.fromPayload({
    id: "task-id",
    title: "Task",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/task-id.md",
  });
  const update: UpdateTaskParams = { filePath: task.filePath };
  const remove: DeleteTaskParams = { filePath: task.filePath };
  const move: MoveTaskParams = {
    filePath: task.filePath,
    fromColumn: "Todo",
    toColumn: "Done",
    toColumnFilePaths: [task.filePath],
    expectedToColumnOrder: [task.filePath],
  };
  const addLink: AddLinkParams = {
    sourceFilePath: task.filePath,
    targetFilePath: task.filePath,
  };

  // @ts-expect-error TaskIdはupdate対象のcanonical pathではない。
  const invalidUpdate: UpdateTaskParams = { filePath: task.id };
  // @ts-expect-error TaskIdはdelete対象のcanonical pathではない。
  const invalidDelete: DeleteTaskParams = { filePath: task.id };
  const invalidLink: AddLinkParams = {
    // @ts-expect-error TaskIdはlink sourceのcanonical pathではない。
    sourceFilePath: task.id,
    targetFilePath: task.filePath,
  };

  expectTypeOf(update.filePath).toEqualTypeOf<TaskFilePath>();
  expectTypeOf(remove.filePath).toEqualTypeOf<TaskFilePath>();
  expectTypeOf(move.toColumnFilePaths).toEqualTypeOf<
    readonly TaskFilePath[]
  >();
  expectTypeOf(addLink.targetFilePath).toEqualTypeOf<TaskFilePath>();
  expectTypeOf(invalidUpdate.filePath).toEqualTypeOf<TaskFilePath>();
  expectTypeOf(invalidDelete.filePath).toEqualTypeOf<TaskFilePath>();
  expectTypeOf(invalidLink.sourceFilePath).toEqualTypeOf<TaskFilePath>();
});
