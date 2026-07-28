import {
  WatcherSession,
  type WatcherSessionPayloadInput,
} from "@/domains/watcher-session";
import type { TaskPayload } from "@/types/task";
import type { WatcherEnvelope, WatcherPayload } from "../index";

/** gate テスト共通の baseline session。 */
export const SESSION_PAYLOAD: WatcherSessionPayloadInput = {
  projectKey: "/home/user/specs",
  generation: 3,
  revision: 42,
  eventSeq: 17,
};

/**
 * baseline session を組み立てる。
 * @param overrides 差し替えるフィールド
 * @returns WatcherSession
 */
export const session = (
  overrides: Partial<WatcherSessionPayloadInput> = {},
): WatcherSession =>
  WatcherSession.fromPayload({ ...SESSION_PAYLOAD, ...overrides });

/**
 * task payload の最小形を作る。
 * @param filePath タスクの相対パス
 * @returns TaskPayload
 */
export const taskPayload = (filePath: string): TaskPayload => ({
  id: filePath,
  title: filePath,
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath,
  extras: {},
  warnings: [],
});

/** envelope を組み立てる際の可変部分。 */
type EnvelopeOverrides = {
  readonly projectKey?: string;
  readonly generation?: number;
  readonly revision?: number;
  readonly cacheMutating?: boolean;
  readonly eventSeq?: number;
  readonly changeId?: string;
  readonly payload?: WatcherPayload;
};

/**
 * cache を変更する envelope を組み立てる。
 * @param overrides 差し替えるフィールド
 * @returns WatcherEnvelope
 */
export const envelope = (
  overrides: EnvelopeOverrides = {},
): WatcherEnvelope => {
  const generation = overrides.generation ?? SESSION_PAYLOAD.generation;
  const eventSeq = overrides.eventSeq ?? SESSION_PAYLOAD.eventSeq + 1;
  const rawProjectKey = overrides.projectKey ?? SESSION_PAYLOAD.projectKey;
  const projectKey = rawProjectKey as WatcherEnvelope["projectKey"];
  return {
    projectKey,
    generation,
    revision: overrides.revision ?? SESSION_PAYLOAD.revision + 1,
    cacheMutating: overrides.cacheMutating ?? true,
    eventSeq,
    changeId: overrides.changeId ?? `${generation}-${eventSeq}`,
    payload: overrides.payload ?? {
      kind: "task-updated",
      task: taskPayload("tasks/a.md"),
    },
  };
};

/**
 * 診断 envelope（cacheMutating: false）を組み立てる。
 * @param overrides 差し替えるフィールド
 * @returns WatcherEnvelope
 */
export const diagnosticEnvelope = (
  overrides: EnvelopeOverrides = {},
): WatcherEnvelope =>
  envelope({
    cacheMutating: false,
    revision: SESSION_PAYLOAD.revision,
    payload: {
      kind: "diagnostic",
      code: "resourceExhausted",
      message: "inotify watch limit reached",
      paths: [],
    },
    ...overrides,
  });

/**
 * 再取得要求 envelope を組み立てる。
 * @param overrides 差し替えるフィールド
 * @returns WatcherEnvelope
 */
export const resyncEnvelope = (
  overrides: EnvelopeOverrides = {},
): WatcherEnvelope =>
  envelope({
    payload: { kind: "resync-required", reason: "rescan" },
    ...overrides,
  });
