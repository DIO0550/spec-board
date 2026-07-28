import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";

let nextEventSeq = WATCHER_SESSION_FIXTURE.eventSeq;
let nextRevision = WATCHER_SESSION_FIXTURE.revision;

/** envelope の連番採番をテスト間でリセットする。 */
export const resetWatcherEnvelopeCounters = (): void => {
  nextEventSeq = WATCHER_SESSION_FIXTURE.eventSeq;
  nextRevision = WATCHER_SESSION_FIXTURE.revision;
};

/** envelope の identity / 順序フィールドの差し替え。 */
export type WatcherEnvelopeOverrides = Partial<{
  projectKey: string;
  generation: number;
  revision: number;
  cacheMutating: boolean;
  eventSeq: number;
}>;

/**
 * BE が emit する envelope を組み立てる。
 *
 * `eventSeq` / `revision` は呼び出しごとに自動で 1 つ進むため、既存テストの
 * 「payload を投げると反映される」という前提をそのまま保てる。
 * @param payload event 固有の payload
 * @param overrides identity / 順序フィールドの差し替え
 * @returns envelope
 */
export const watcherEnvelope = (
  payload: unknown,
  overrides: WatcherEnvelopeOverrides = {},
): Record<string, unknown> => {
  nextEventSeq += 1;
  nextRevision += 1;
  const generation = overrides.generation ?? WATCHER_SESSION_FIXTURE.generation;
  const eventSeq = overrides.eventSeq ?? nextEventSeq;
  return {
    projectKey: overrides.projectKey ?? WATCHER_SESSION_FIXTURE.projectKey,
    generation,
    revision: overrides.revision ?? nextRevision,
    cacheMutating: overrides.cacheMutating ?? true,
    eventSeq,
    changeId: `${generation}-${eventSeq}`,
    payload,
  };
};
