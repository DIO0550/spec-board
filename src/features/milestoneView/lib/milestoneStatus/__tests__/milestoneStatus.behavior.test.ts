import { expect, test } from "vitest";
import {
  daysUntil,
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

// 以下 2 件は Math.floor 化の挙動を担保するテスト。parseDue を経由する
// ISO date-time 文字列 ("...T23:00:00Z") はローカルタイムゾーン依存で結果が
// 揺れるため、daysUntil を Date オブジェクトで直接呼んで TZ 非依存にする。

test("daysUntil: 同日内 23:00 の due は 0 日（Math.floor で切り捨て）", () => {
  const now = new Date(2026, 5, 21, 0, 0); // 2026-06-21 00:00 (ローカル)
  const due = new Date(2026, 5, 21, 23, 0); // 2026-06-21 23:00 (ローカル)
  expect(daysUntil(due, now)).toBe(0);
});

test("daysUntil: 翌日 03:00 の due は 1 日（時刻部分でブレない）", () => {
  const now = new Date(2026, 5, 21, 0, 0); // 2026-06-21 00:00 (ローカル)
  const due = new Date(2026, 5, 22, 3, 0); // 2026-06-22 03:00 (ローカル)
  expect(daysUntil(due, now)).toBe(1);
});

test("dueSortKey: due 未設定は +Infinity（末尾送り）", () => {
  expect(dueSortKey({ name: "v0.1" })).toBe(Number.POSITIVE_INFINITY);
});

test("dueSortKey: due が早い方が小さい値", () => {
  const a = dueSortKey({ name: "a", due: "2026-01-01" });
  const b = dueSortKey({ name: "b", due: "2026-12-31" });
  expect(a).toBeLessThan(b);
});
