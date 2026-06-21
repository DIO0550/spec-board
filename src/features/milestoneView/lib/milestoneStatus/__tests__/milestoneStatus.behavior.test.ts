import { expect, test } from "vitest";
import {
  dueSortKey,
  resolveCountdown,
  resolveDisplayStatus,
} from "@/features/milestoneView/lib/milestoneStatus";

const NOW = new Date(2026, 5, 21); // 2026-06-21（ローカル）

test("state=closed は常に closed", () => {
  const def = { name: "v0.1", state: "closed", due: "2026-12-31" } as const;
  expect(resolveDisplayStatus(def, NOW)).toBe("closed");
});

test("open かつ期日が過去は overdue", () => {
  const def = { name: "v0.1", state: "open", due: "2026-06-20" } as const;
  expect(resolveDisplayStatus(def, NOW)).toBe("overdue");
});

test("open かつ期日が今日以降は open", () => {
  const def = { name: "v0.1", state: "open", due: "2026-06-21" } as const;
  expect(resolveDisplayStatus(def, NOW)).toBe("open");
});

test("open かつ due 未設定は open", () => {
  const def = { name: "v0.1", state: "open" } as const;
  expect(resolveDisplayStatus(def, NOW)).toBe("open");
});

test("closed のカウントダウンは done", () => {
  const def = { name: "v0.1", state: "closed", due: "2025-01-01" } as const;
  expect(resolveCountdown(def, NOW)).toEqual({ kind: "done", label: "完了" });
});

test("due 未設定のカウントダウンは none", () => {
  const def = { name: "v0.1", state: "open" } as const;
  expect(resolveCountdown(def, NOW)).toEqual({
    kind: "none",
    label: "期日未設定",
  });
});

test("期日が今日のカウントダウンは soon/今日", () => {
  const def = { name: "v0.1", state: "open", due: "2026-06-21" } as const;
  expect(resolveCountdown(def, NOW)).toEqual({ kind: "soon", label: "今日" });
});

test("期日が 7 日以内のカウントダウンは soon", () => {
  const def = { name: "v0.1", state: "open", due: "2026-06-28" } as const;
  expect(resolveCountdown(def, NOW)).toEqual({
    kind: "soon",
    label: "あと 7 日",
  });
});

test("期日が 8 日以遠のカウントダウンは future", () => {
  const def = { name: "v0.1", state: "open", due: "2026-06-29" } as const;
  expect(resolveCountdown(def, NOW)).toEqual({
    kind: "future",
    label: "あと 8 日",
  });
});

test("期日超過のカウントダウンは overdue（超過日数を表示）", () => {
  const def = { name: "v0.1", state: "open", due: "2026-06-18" } as const;
  expect(resolveCountdown(def, NOW)).toEqual({
    kind: "overdue",
    label: "3 日超過",
  });
});

test("due が ISO date-time（同日内の時刻）でもカウントダウンは「今日」として扱う", () => {
  // 2026-06-21 23:00 (NOW=00:00 同日) → 暦日差は 0 日（同日内）
  const def = {
    name: "v0.1",
    state: "open",
    due: "2026-06-21T23:00:00Z",
  } as const;
  const res = resolveCountdown(def, NOW);
  expect(res.kind).toBe("soon");
  expect(res.label).toBe("今日");
});

test("due が 1 日後の早朝でも「あと 1 日」になる（Math.floor で日数を切り捨て）", () => {
  // 2026-06-22 03:00 (NOW=00:00 同日基準) → 1 日と 3 時間後 → floor で 1 日
  const def = {
    name: "v0.1",
    state: "open",
    due: "2026-06-22T03:00:00Z",
  } as const;
  const res = resolveCountdown(def, NOW);
  expect(res.kind).toBe("soon");
  expect(res.label).toBe("あと 1 日");
});

test("dueSortKey: due 未設定は +Infinity（末尾送り）", () => {
  expect(dueSortKey({ name: "v0.1" })).toBe(Number.POSITIVE_INFINITY);
});

test("dueSortKey: due が早い方が小さい値", () => {
  const a = dueSortKey({ name: "a", due: "2026-01-01" });
  const b = dueSortKey({ name: "b", due: "2026-12-31" });
  expect(a).toBeLessThan(b);
});
