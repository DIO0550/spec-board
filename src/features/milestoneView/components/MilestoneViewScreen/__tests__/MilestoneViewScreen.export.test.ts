import { afterEach, expect, test, vi } from "vitest";
import type { MilestoneDefinition } from "@/domains/milestone";
import { downloadMilestonesCsv } from "..";

afterEach(() => {
  vi.restoreAllMocks();
});

test("CSVを生成してmilestones.csvとしてダウンロードする", async () => {
  const definitions: MilestoneDefinition[] = [
    {
      name: "release,one",
      title: "Release one",
      state: "open",
      description: 'He said "go"',
    },
  ];
  let exportedBlob: Blob | undefined;
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    expect(blob).toBeInstanceOf(Blob);
    exportedBlob = blob as Blob;
    return "blob:milestones";
  });
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});

  downloadMilestonesCsv(definitions);

  expect(await exportedBlob?.text()).toBe(
    'name,state,due,description\n"release,one","open","","He said ""go"""',
  );
  expect(click).toHaveBeenCalledOnce();
  expect(revoke).toHaveBeenCalledWith("blob:milestones");
});

test("正常値・引用符・改行をRFC 4180形式でquoteする", async () => {
  const definitions: MilestoneDefinition[] = [
    {
      name: "Release",
      title: "Release",
      state: "open",
      due: "2026-08-31",
      description: 'first line\nsecond "line"',
    },
  ];
  let exportedBlob: Blob | undefined;
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    exportedBlob = blob as Blob;
    return "blob:rfc4180";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

  downloadMilestonesCsv(definitions);

  expect(await exportedBlob?.text()).toBe(
    'name,state,due,description\n"Release","open","2026-08-31","first line\nsecond ""line"""',
  );
});

test.each([
  "=1+1",
  "+cmd",
  "-2+3",
  "@SUM(A1)",
  '  =HYPERLINK("x")',
])("表計算式として解釈される危険prefixを無害化する: %s", async (name) => {
  const definitions: MilestoneDefinition[] = [
    { name, title: name, state: "open" },
  ];
  let exportedBlob: Blob | undefined;
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    exportedBlob = blob as Blob;
    return "blob:safe";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

  downloadMilestonesCsv(definitions);

  const csv = await exportedBlob?.text();
  expect(csv?.split("\n")[1]?.startsWith("\"'")).toBe(true);
});

test("download clickが失敗してもObject URLを解放する", () => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:failed");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
    throw new Error("download failed");
  });

  expect(() => downloadMilestonesCsv([])).toThrow("download failed");
  expect(revoke).toHaveBeenCalledWith("blob:failed");
});
