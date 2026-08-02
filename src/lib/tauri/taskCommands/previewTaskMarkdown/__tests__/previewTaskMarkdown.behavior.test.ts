import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { previewTaskMarkdown } from "@/lib/tauri";
import { TauriError } from "@/lib/tauri/tauriError";
import type { PreviewTaskMarkdownParams } from "../../types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const PARAMS: PreviewTaskMarkdownParams = {
  title: "Task",
  status: "Todo",
  priority: "High",
  labels: ["bug"],
  parent: "tasks/parent.md",
  links: ["tasks/related.md"],
  due: "2026-08-01",
  draft: true,
  body: "本文",
};

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が preview_task_markdown command と full draft DTO を受け取る", async () => {
  vi.mocked(invoke).mockResolvedValue("---\ntitle: Task\n---\n本文");

  const result = await previewTaskMarkdown(PARAMS);

  expect(vi.mocked(invoke)).toHaveBeenCalledWith(
    "preview_task_markdown",
    PARAMS,
  );
  expect(result).toEqual({
    ok: true,
    value: "---\ntitle: Task\n---\n本文",
  });
});

test("invoke の失敗は TauriError を含む Result.err になる", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("preview failed"));

  const result = await previewTaskMarkdown(PARAMS);

  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
