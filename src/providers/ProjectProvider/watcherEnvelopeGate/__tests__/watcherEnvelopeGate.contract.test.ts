import fixture from "@fixtures/watcher-event/envelope.json";
import { expect, test } from "vitest";
import {
  parseWatcherEnvelope,
  WATCHER_EVENT_NAMES,
  WatcherGate,
} from "../index";

type EnvelopeCase = {
  readonly eventName: string;
  readonly envelope: Record<string, unknown>;
};

const cases: readonly EnvelopeCase[] = fixture.cases as readonly EnvelopeCase[];

test("fixture は 5 つの watcher event をすべて 1 度ずつ宣言している", () => {
  const names = cases.map((testCase) => testCase.eventName).sort();

  expect(names).toEqual([...WATCHER_EVENT_NAMES].sort());
});

test.each(
  cases.map((testCase) => [testCase.eventName, testCase] as const),
)("%s の fixture は TS 側の型ガードを通る", (_eventName, testCase) => {
  const parsed = parseWatcherEnvelope(testCase.eventName, testCase.envelope);

  expect(parsed).not.toBeNull();
});

test.each(
  cases.map((testCase) => [testCase.eventName, testCase] as const),
)("%s の fixture は BE と同じ cacheMutating を宣言している", (eventName, testCase) => {
  const parsed = parseWatcherEnvelope(eventName, testCase.envelope);

  expect(parsed?.cacheMutating).toBe(eventName !== "watcher-diagnostic");
});

test("task 系 fixture は store へ流す action に変換できる", () => {
  const taskCases = cases.filter((testCase) =>
    testCase.eventName.startsWith("task-"),
  );

  const actions = taskCases.map((testCase) => {
    const parsed = parseWatcherEnvelope(testCase.eventName, testCase.envelope);
    return parsed === null ? null : WatcherGate.toAction(parsed);
  });

  expect(actions.every((action) => action !== null)).toBe(true);
});
