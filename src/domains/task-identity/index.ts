import type { Brand } from "@/types/brand";

/** Taskを画面選択・entity identityとして識別するID。 */
export type TaskId = Brand<string, "TaskId">;

/** backendが解決したcanonical task file path。 */
export type TaskFilePath = Brand<string, "TaskFilePath">;
