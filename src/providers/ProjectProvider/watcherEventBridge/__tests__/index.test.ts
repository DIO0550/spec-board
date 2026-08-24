import type { UnlistenFn } from "@tauri-apps/api/event";
import { expect, test, vi } from "vitest";
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";
import {
  resetWatcherEnvelopeCounters,
  watcherEnvelope,
} from "../../__tests__/watcherEnvelopeHarness";
import {
  WATCHER_BUFFER_LIMIT,
  WatcherGate,
  type WatcherGateRef,
} from "../../watcherEnvelopeGate";
import { createWatcherEventBridge, type WatcherListenerRegistration } from "..";

type Deferred<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
};

const deferred = <T>(): Deferred<T> => {
  let resolvePromise: (value: T) => void = () => {};
  let rejectPromise: (reason?: unknown) => void = () => {};
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
};

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

test("5つのlistener登録がすべて完了するまでreadyにならない", async () => {
  const registrations = Array.from({ length: 5 }, () => deferred<UnlistenFn>());
  let registrationIndex = 0;
  const register: WatcherListenerRegistration = vi.fn(() => {
    const registration = registrations[registrationIndex];
    registrationIndex += 1;
    return registration?.promise ?? Promise.reject(new Error("unexpected"));
  });
  const gate: WatcherGateRef = { current: WatcherGate.initial };
  const bridge = createWatcherEventBridge({
    register,
    gate,
    getState: () => ({ kind: "idle" }),
    dispatch: vi.fn(),
    requestResync: vi.fn(),
    notifyDiagnostic: vi.fn(),
  });
  const stop = bridge.start();
  const ready = vi.fn();
  void bridge.ensureReady().then(ready);

  expect(register).toHaveBeenCalledTimes(5);

  for (const registration of registrations.slice(0, 4)) {
    registration.resolve(vi.fn());
  }
  await flushPromises();

  expect(ready).not.toHaveBeenCalled();

  registrations[4]?.resolve(vi.fn());
  await flushPromises();

  expect(ready).toHaveBeenCalledWith({ kind: "ready" });
  stop();
});

type CapturedPayloadHandler = (payload: unknown) => void;

const queueEvents = async (
  count: number,
): Promise<ReturnType<typeof vi.fn>> => {
  resetWatcherEnvelopeCounters();
  const handlers: Record<string, CapturedPayloadHandler> = {};
  const requestResync = vi.fn();
  const bridge = createWatcherEventBridge({
    register: async (eventName, handler) => {
      handlers[eventName] = handler;
      const unlisten: UnlistenFn = vi.fn();
      return unlisten;
    },
    gate: { current: WatcherGate.initial },
    getState: () => ({ kind: "idle" }),
    dispatch: vi.fn(),
    requestResync,
    notifyDiagnostic: vi.fn(),
  });
  const stop = bridge.start();
  await bridge.ensureReady();
  bridge.beginOpen(1);

  Array.from({ length: count }).forEach(() => {
    handlers["task-created"]?.(
      watcherEnvelope({
        task: { id: "tasks/queued.md", filePath: "tasks/queued.md" },
      }),
    );
  });
  bridge.commitOpen(1, WATCHER_SESSION_FIXTURE, vi.fn());
  stop();
  return requestResync;
};

test("queueは200件を保持し201件目でfull resyncを1回だけ要求する", async () => {
  const atLimit = await queueEvents(WATCHER_BUFFER_LIMIT);
  const overflow = await queueEvents(WATCHER_BUFFER_LIMIT + 1);

  expect(atLimit).not.toHaveBeenCalled();
  expect(overflow).toHaveBeenCalledTimes(1);
  expect(overflow).toHaveBeenCalledWith("event-gap");
});
