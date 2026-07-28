import {
  WatcherSession,
  type WatcherSessionPayloadInput,
} from "@/domains/watcher-session";

/**
 * テスト用の watcher session。`projectKey` が brand 型のため、テストから
 * literal で組み立てられない。ProjectData / IPC payload を組み立てる各テストは
 * この固定値を使う。
 * @param overrides 差し替えるフィールド
 * @returns WatcherSession
 */
export const watcherSessionFixture = (
  overrides: Partial<WatcherSessionPayloadInput> = {},
): WatcherSession =>
  WatcherSession.fromPayload({
    projectKey: "/test/project",
    generation: 1,
    revision: 1,
    eventSeq: 0,
    ...overrides,
  });

/** 既定値の固定参照。参照同一性を確かめたいテスト向け。 */
export const WATCHER_SESSION_FIXTURE: WatcherSession = watcherSessionFixture();
