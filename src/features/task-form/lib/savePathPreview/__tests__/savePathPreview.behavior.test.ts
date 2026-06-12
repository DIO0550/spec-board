import { expect, test } from "vitest";
import { SavePathPreview } from "..";

test("buildUniqueFileName: 衝突がなければ {base}.md をそのまま返す", () => {
  expect(SavePathPreview.buildUniqueFileName("foo", new Set())).toBe("foo.md");
});

test.each([
  [["foo.md"], "foo-1.md"],
  [["foo.md", "foo-1.md"], "foo-2.md"],
  [["foo.md", "foo-2.md"], "foo-1.md"],
] as const)("buildUniqueFileName golden: 既存 %j では連番の最初の空きを使う", (existing, expected) => {
  expect(SavePathPreview.buildUniqueFileName("foo", new Set(existing))).toBe(
    expected,
  );
});

test("buildUniqueFileName golden: base 末尾数字を解釈しない（task-1 + 既存 task-1.md → task-1-1.md）", () => {
  expect(
    SavePathPreview.buildUniqueFileName("task-1", new Set(["task-1.md"])),
  ).toBe("task-1-1.md");
});

test("buildUniqueFileName golden: 大文字小文字を区別する（既存 FOO.md は foo.md と衝突しない）", () => {
  expect(SavePathPreview.buildUniqueFileName("foo", new Set(["FOO.md"]))).toBe(
    "foo.md",
  );
});

test("buildUniqueFileName golden: base 内のドットを不透明に扱う（foo.bar → foo.bar-1.md）", () => {
  expect(
    SavePathPreview.buildUniqueFileName("foo.bar", new Set(["foo.bar.md"])),
  ).toBe("foo.bar-1.md");
});

const computeInput = (
  overrides: Partial<Parameters<typeof SavePathPreview.compute>[0]> = {},
): Parameters<typeof SavePathPreview.compute>[0] => ({
  title: "",
  fileName: "",
  existingTaskFilePaths: [],
  ...overrides,
});

test("compute: title のみ入力で tasks/{kebab}.md の relPath になる", () => {
  const result = SavePathPreview.compute(
    computeInput({ title: "My Task", projectPath: "/tmp/project" }),
  );
  expect(result).toEqual({
    kind: "path",
    fileName: "my-task.md",
    relPath: "tasks/my-task.md",
    fullPath: "/tmp/project/tasks/my-task.md",
  });
});

test("compute: 親タスク指定で targetDir が親の dirname になる", () => {
  const result = SavePathPreview.compute(
    computeInput({ title: "Child", parentFilePath: "tasks/epic/parent.md" }),
  );
  expect(result).toMatchObject({
    kind: "path",
    relPath: "tasks/epic/child.md",
  });
});

test.each([
  ["./tasks/epic/parent.md"],
  ["tasks\\epic\\parent.md"],
] as const)("compute: parent filePath の表記揺れ %s でも targetDir が tasks/epic になる", (parentFilePath) => {
  const result = SavePathPreview.compute(
    computeInput({ title: "Child", parentFilePath }),
  );
  expect(result).toMatchObject({
    kind: "path",
    relPath: "tasks/epic/child.md",
  });
});

test("compute: 明示 fileName（.md なし）は {base}.md として表示される", () => {
  const result = SavePathPreview.compute(
    computeInput({ title: "My Task", fileName: "custom-name" }),
  );
  expect(result).toMatchObject({ kind: "path", fileName: "custom-name.md" });
});

test.each([
  ["custom.md"],
  ["custom.MD"],
] as const)("compute: 明示 fileName %s は二重拡張子にならず base 正規化が toParam と一致する", (fileName) => {
  const result = SavePathPreview.compute(computeInput({ fileName }));
  expect(result).toMatchObject({ kind: "path", fileName: "custom.md" });
});

test("compute: 同 targetDir に既存ファイルがあると連番が付く", () => {
  const result = SavePathPreview.compute(
    computeInput({
      title: "My Task",
      existingTaskFilePaths: ["tasks/my-task.md"],
    }),
  );
  expect(result).toMatchObject({ kind: "path", fileName: "my-task-1.md" });
});

test("compute: 既存 filePath 側の表記揺れ（./ 前置・\\ 区切り）も正規化して照合する", () => {
  const result = SavePathPreview.compute(
    computeInput({
      title: "My Task",
      existingTaskFilePaths: ["./tasks/my-task.md"],
    }),
  );
  expect(result).toMatchObject({ kind: "path", fileName: "my-task-1.md" });
});

test("compute: targetDir 外の同名ファイルは衝突に数えない（直下のみ照合）", () => {
  const result = SavePathPreview.compute(
    computeInput({
      title: "My Task",
      existingTaskFilePaths: ["tasks/sub/my-task.md"],
    }),
  );
  expect(result).toMatchObject({ kind: "path", fileName: "my-task.md" });
});

test("compute: title 空 + fileName 空は pending を返す", () => {
  expect(SavePathPreview.compute(computeInput())).toEqual({ kind: "pending" });
});

test.each([
  [".md"],
  [" .md"],
] as const)("compute: fileName %s（base が空になる入力）+ title ありは title 由来へフォールバックする（toParam が undefined を返す実送信パラメータと同値）", (fileName) => {
  const result = SavePathPreview.compute(
    computeInput({ title: "My Task", fileName }),
  );
  expect(result).toMatchObject({ kind: "path", fileName: "my-task.md" });
});

test.each([
  [".md"],
  [" .md"],
] as const)("compute: fileName %s + title も空なら pending を返す（invalid にしない）", (fileName) => {
  expect(SavePathPreview.compute(computeInput({ fileName }))).toEqual({
    kind: "pending",
  });
});

test("compute: title が記号のみで kebab base が空なら pending を返す", () => {
  expect(SavePathPreview.compute(computeInput({ title: "!!!" }))).toEqual({
    kind: "pending",
  });
});

test.each([
  ["a/b"],
  ["a\\b"],
] as const)("compute: セパレータ含み fileName %s は invalid + 該当文字を返す（BE from_explicit の拒否と整合）", (fileName) => {
  const result = SavePathPreview.compute(computeInput({ fileName }));
  expect(result.kind).toBe("invalid");
  if (result.kind === "invalid") {
    expect(result.error.code).toBe("FORBIDDEN_CHAR");
    expect(result.error.chars.length).toBeGreaterThan(0);
  }
});

test.each([
  ["a:b"],
  ["a?b"],
  ["a*b"],
] as const)("compute: OS 予約文字含み fileName %s は invalid を返す（FileNameField.validate の error をそのまま保持）", (fileName) => {
  const result = SavePathPreview.compute(computeInput({ fileName }));
  expect(result.kind).toBe("invalid");
});

test("compute: projectPath 未指定では fullPath が relPath と同値になる", () => {
  const result = SavePathPreview.compute(computeInput({ title: "My Task" }));
  expect(result).toMatchObject({
    kind: "path",
    relPath: "tasks/my-task.md",
    fullPath: "tasks/my-task.md",
  });
});

test("compute: projectPath 末尾の / は除去して結合する（// 混入なし）", () => {
  const result = SavePathPreview.compute(
    computeInput({ title: "My Task", projectPath: "/tmp/project/" }),
  );
  expect(result).toMatchObject({
    kind: "path",
    fullPath: "/tmp/project/tasks/my-task.md",
  });
});

test.each([
  ["C:\\repo"],
  ["C:\\repo\\"],
] as const)("compute: Windows パスの projectPath %s では relPath を \\ 区切りへ変換し混在なしで結合する", (projectPath) => {
  const result = SavePathPreview.compute(
    computeInput({ title: "My Task", projectPath }),
  );
  expect(result).toMatchObject({
    kind: "path",
    fullPath: "C:\\repo\\tasks\\my-task.md",
  });
});

test("compute: 同じ入力での再計算は同じ結果を返す（べき等性）", () => {
  const input = computeInput({
    title: "My Task",
    fileName: "custom",
    parentFilePath: "tasks/epic/parent.md",
    existingTaskFilePaths: ["tasks/epic/custom.md"],
    projectPath: "/tmp/p",
  });
  expect(SavePathPreview.compute(input)).toEqual(
    SavePathPreview.compute(input),
  );
});

test("compute: ドライブ直下の projectPath（C:\\）でも \\ 区切りで結合する", () => {
  const result = SavePathPreview.compute(
    computeInput({ title: "My Task", projectPath: "C:\\" }),
  );
  expect(result).toMatchObject({
    kind: "path",
    fullPath: "C:\\tasks\\my-task.md",
  });
});
