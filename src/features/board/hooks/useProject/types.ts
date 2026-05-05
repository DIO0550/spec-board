import type {
  CreateTaskParams,
  DeleteTaskParams,
  UpdateTaskParams,
} from "@/lib/tauri";
import type { Task } from "@/types/task";
import type { Result as ResultT } from "@/utils/result";
import type { ColumnsCommand, ColumnsCommandBuilder } from "./domain/columns";
import type { ProjectState } from "./domain/projectState";
import type { ProjectError } from "./errors";

export type {
  ColumnsCommand,
  ColumnsCommandBuilder,
} from "./domain/columns";

export type UpdateColumnsInput = ColumnsCommand | ColumnsCommandBuilder;

export type UseProjectOptions = {
  onError?: (error: ProjectError) => void;
};

export type UseProjectResult = {
  state: ProjectState;
  openProject: () => Promise<void>;
  createTask: (
    params: CreateTaskParams,
  ) => Promise<ResultT<Task, ProjectError>>;
  updateTask: (
    params: UpdateTaskParams,
  ) => Promise<ResultT<Task, ProjectError>>;
  deleteTask: (
    params: DeleteTaskParams,
  ) => Promise<ResultT<void, ProjectError>>;
  updateColumns: (
    command: UpdateColumnsInput,
  ) => Promise<ResultT<{ applied: boolean }, ProjectError>>;
  reset: () => void;
};
