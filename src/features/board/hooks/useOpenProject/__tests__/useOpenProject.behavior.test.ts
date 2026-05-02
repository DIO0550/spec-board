import { expect, test } from "vitest";
import { type OpenProjectPayload, TauriError } from "@/lib/tauri";
import { type OpenProjectState, reducer } from "..";

const samplePayload: OpenProjectPayload = { tasks: [], columns: [] };

test("reducer: start で loading{path} に遷移する", () => {
  const next = reducer({ kind: "idle" }, { type: "start", path: "/a" });
  expect(next).toEqual({ kind: "loading", path: "/a" });
});

test("reducer: succeed で loaded{path,data} に遷移する", () => {
  const next = reducer(
    { kind: "loading", path: "/a" },
    { type: "succeed", path: "/a", data: samplePayload },
  );
  expect(next).toEqual({ kind: "loaded", path: "/a", data: samplePayload });
});

test("reducer: fail で error{path,error} に遷移する", () => {
  const error = new TauriError("UNKNOWN", "boom");
  const next = reducer(
    { kind: "loading", path: "/a" },
    { type: "fail", path: "/a", error },
  );
  expect(next).toEqual({ kind: "error", path: "/a", error });
});

test("reducer: reset で任意状態から idle に戻る", () => {
  const states: OpenProjectState[] = [
    { kind: "idle" },
    { kind: "loading", path: "/a" },
    { kind: "loaded", path: "/a", data: samplePayload },
    { kind: "error", path: "/a", error: new TauriError("UNKNOWN", "x") },
  ];
  for (const s of states) {
    expect(reducer(s, { type: "reset" })).toEqual({ kind: "idle" });
  }
});
