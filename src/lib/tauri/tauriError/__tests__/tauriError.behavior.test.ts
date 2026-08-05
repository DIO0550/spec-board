import { expect, test } from "vitest";
import { TauriError } from "@/lib/tauri/tauriError";

test("Error インスタンスから message を読み取り cause に元 Error を保持する", () => {
  const raw = new Error("read failed");
  const e = TauriError.from(raw);
  expect(e.message).toBe("read failed");
  expect(e.cause).toBe(raw);
});

test("string 入力は message にそのまま採用、cause に文字列を保持する", () => {
  const raw = "string error";
  const e = TauriError.from(raw);
  expect(e.message).toBe("string error");
  expect(e.cause).toBe(raw);
});

test("{ message } オブジェクトから message を読み取り cause にオブジェクトを保持する", () => {
  const raw = { message: "obj error", extra: 1 };
  const e = TauriError.from(raw);
  expect(e.message).toBe("obj error");
  expect(e.cause).toBe(raw);
});

test.for([
  ["null", null],
  ["数値", 42],
  ["空オブジェクト", {}],
  ["真偽値", true],
] as const)("%s は UNKNOWN + 既定メッセージにフォールバックする", ([, raw]) => {
  const e = TauriError.from(raw);
  expect(e.code).toBe("UNKNOWN");
  expect(e.message).toBe("不明なエラーが発生しました");
  expect(e.cause).toBe(raw);
});

test.for([
  [
    "「ディレクトリが見つかりません: /x」",
    "ディレクトリが見つかりません: /x",
    "NOT_FOUND",
  ],
  ["「not found」", "file not found", "NOT_FOUND"],
  [
    "「アクセスできません」",
    "ディレクトリにアクセスできません: /x",
    "PERMISSION_DENIED",
  ],
  ["「permission denied」", "permission denied", "PERMISSION_DENIED"],
  ["「読み取りに失敗」", "読み取りに失敗しました", "IO_ERROR"],
  ["「書き込みに失敗」", "書き込みに失敗しました", "IO_ERROR"],
  [
    "「フロントマターのパースに失敗」",
    "フロントマターのパースに失敗しました",
    "PARSE_ERROR",
  ],
  ["「parse error」", "yaml parse error", "PARSE_ERROR"],
  ["「I/O error」", "I/O error occurred", "IO_ERROR"],
] as const)("%s は対応 code に分類される", ([, message, code]) => {
  const e = TauriError.from(new Error(message));
  expect(e.code).toBe(code);
});

test.for([
  [
    "「task has children: foo/bar.md (children: ...)」",
    "task has children: foo/bar.md (children: child-1.md)",
    "HAS_CHILDREN",
  ],
  [
    "「Task Has Children: 大文字混在」",
    "Task Has Children: parent.md",
    "HAS_CHILDREN",
  ],
] as const)("%s は HAS_CHILDREN に分類される", ([, message, code]) => {
  const e = TauriError.from(new Error(message));
  expect(e.code).toBe(code);
});

test("文字列 reject 'task has children: foo.md' も HAS_CHILDREN に分類される", () => {
  const e = TauriError.from("task has children: foo.md");
  expect(e.code).toBe("HAS_CHILDREN");
});

test.for([
  ["「action」", "action required"],
  ["「optional」", "optional field missing"],
  ["「sparse」", "sparse data"],
] as const)("%s は IO/PARSE トークンを部分的に含むが UNKNOWN になる", ([
  ,
  message,
]) => {
  const e = TauriError.from(new Error(message));
  expect(e.code).toBe("UNKNOWN");
});

test("既知パターンに該当しない文言は UNKNOWN", () => {
  const e = TauriError.from(new Error("何か変なエラー"));
  expect(e.code).toBe("UNKNOWN");
});

test("TauriError.name は 'TauriError' である", () => {
  const e = new TauriError("UNKNOWN", "x");
  expect(e.name).toBe("TauriError");
});

test("TauriError は Error / TauriError として instanceof で識別できる", () => {
  const e = new TauriError("UNKNOWN", "x");
  expect(e).toBeInstanceOf(Error);
  expect(e).toBeInstanceOf(TauriError);
});

test("from(raw, command) は起点コマンド名を command に保持する", () => {
  const e = TauriError.from(new Error("書き込みに失敗しました"), "create_task");
  expect(e.command).toBe("create_task");
});

test("from(raw) で command を省略すると command は undefined（後方互換）", () => {
  const raw = new Error("書き込みに失敗しました");
  const e = TauriError.from(raw);
  expect(e.command).toBeUndefined();
  expect(e.message).toBe("書き込みに失敗しました");
  expect(e.code).toBe("IO_ERROR");
  expect(e.cause).toBe(raw);
});

test("from: 'invalid file name: ...' は INVALID_FILE_NAME に分類される", () => {
  const e = TauriError.from(
    new Error(
      "invalid file name: task file name must not contain path separator (got `a/b.md`)",
    ),
  );
  expect(e.code).toBe("INVALID_FILE_NAME");
});

test.each([
  ["task has children", "HAS_CHILDREN"],
  ["親タスクが見つかりません: tasks/x.md", "NOT_FOUND"],
  ["フロントマターの解析に失敗しました", "PARSE_ERROR"],
])("既存パターン '%s' は引き続き %s に分類される（非干渉リグレッション）", (message, code) => {
  expect(TauriError.from(new Error(message)).code).toBe(code);
});

test.each([
  [
    "CardOrderConflict",
    "移動先カラムの並びが変わっています: Done（期待=2件, 実際=3件）",
  ],
  [
    "StatusMismatch",
    "タスクの状態が変わっています: 期待=Todo, 実際=In Progress",
  ],
])("BE の %s の文言は CONFLICT に分類される", (_, message) => {
  expect(TauriError.from(new Error(message)).code).toBe("CONFLICT");
});

test("「変わっています」を含まない類似文言は CONFLICT にならない", () => {
  const e = TauriError.from(new Error("カラムの並びを更新しました"));
  expect(e.code).toBe("UNKNOWN");
});
