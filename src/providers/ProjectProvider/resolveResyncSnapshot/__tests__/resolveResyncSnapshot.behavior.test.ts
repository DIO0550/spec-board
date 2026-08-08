import { expect, test } from "vitest";
import { TauriError } from "@/lib/tauri";
import { Result } from "@/utils/result";
import { resolveResyncSnapshot } from "../index";
import {
  DATA,
  GENERATION,
  input,
  PATH,
  REQUEST,
  session,
  snapshot,
} from "./resolveResyncSnapshotFixtures";

test("すべて一致すれば採用する", () => {
  const payload = snapshot();

  const resolution = resolveResyncSnapshot(
    input({ result: Result.ok(payload) }),
  );

  expect(resolution).toEqual({ kind: "use", snapshot: payload, data: DATA });
});

test("追い越された応答は破棄する", () => {
  const resolution = resolveResyncSnapshot(
    input({ currentRequestId: REQUEST.id + 1 }),
  );

  expect(resolution).toEqual({ kind: "drop", reason: "newer-request-exists" });
});

test("読み取り中に mutation が走っていたら取り直す", () => {
  const resolution = resolveResyncSnapshot(
    input({ queueNow: Promise.resolve() }),
  );

  expect(resolution).toEqual({
    kind: "refetch",
    reason: "changed-while-reading",
  });
});

test("get_tasks が失敗していたら破棄する", () => {
  const resolution = resolveResyncSnapshot(
    input({ result: Result.err(new TauriError("IO_ERROR", "読み取り失敗")) }),
  );

  expect(resolution).toEqual({ kind: "drop", reason: "fetch-failed" });
});

test("project が切り替わっていたら破棄する", () => {
  const resolution = resolveResyncSnapshot(
    input({ state: { kind: "loaded", path: "/home/user/other", data: DATA } }),
  );

  expect(resolution).toEqual({ kind: "drop", reason: "project-changed" });
});

test("未 load なら破棄する", () => {
  const resolution = resolveResyncSnapshot(input({ state: { kind: "idle" } }));

  expect(resolution).toEqual({ kind: "drop", reason: "project-changed" });
});

test("watcher 世代が変わっていたら破棄する", () => {
  const resolution = resolveResyncSnapshot(
    input({ gateSession: session({ generation: GENERATION + 1 }) }),
  );

  expect(resolution).toEqual({ kind: "drop", reason: "generation-changed" });
});

test("gate に session が無ければ世代の変化として破棄する", () => {
  const resolution = resolveResyncSnapshot(input({ gateSession: null }));

  expect(resolution).toEqual({ kind: "drop", reason: "generation-changed" });
});

test("応答の session が別 project のものなら破棄する", () => {
  const foreign = session({ projectKey: "/home/user/other" });

  const resolution = resolveResyncSnapshot(
    input({ result: Result.ok(snapshot(foreign)) }),
  );

  expect(resolution).toEqual({ kind: "drop", reason: "session-changed" });
});

test("追い越しと mutation が同時に起きたら追い越しを先に返す", () => {
  const resolution = resolveResyncSnapshot(
    input({
      currentRequestId: REQUEST.id + 1,
      queueNow: Promise.resolve(),
    }),
  );

  expect(resolution).toEqual({ kind: "drop", reason: "newer-request-exists" });
});

test("mutation と IPC 失敗が同時に起きたら取り直しを先に返す", () => {
  const resolution = resolveResyncSnapshot(
    input({
      queueNow: Promise.resolve(),
      result: Result.err(new TauriError("IO_ERROR", "読み取り失敗")),
    }),
  );

  expect(resolution).toEqual({
    kind: "refetch",
    reason: "changed-while-reading",
  });
});

test("採用時の data は判定に使った loaded state のもの", () => {
  const other = { ...DATA, openRequestId: 7 };

  const resolution = resolveResyncSnapshot(
    input({ state: { kind: "loaded", path: PATH, data: other } }),
  );

  expect(resolution).toEqual({
    kind: "use",
    snapshot: expect.anything(),
    data: other,
  });
});
