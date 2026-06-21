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

test("存在しない日付 (2026-02-31 等) は parseDue で undefined 扱いになり countdown=none", () => {
  const def = { name: "v0.1", state: "open", due: "2026-02-31" } as const;
  const res = resolveCountdown(def, NOW);
  expect(res.kind).toBe("none");
  expect(res.label).toBe("期日未設定");
});

test("存在しない月 (2026-13-01) も undefined 扱いになる", () => {
  const def = { name: "v0.1", state: "open", due: "2026-13-01" } as const;
  expect(resolveDisplayStatus(def, NOW)).toBe("open");
  expect(dueSortKey(def)).toBe(Number.POSITIVE_INFINITY);
});

test("ISO datetime 形式の存在しない日付 (2026-02-31T00:00:00Z) も undefined 扱い", () => {
  const def = {
    name: "v0.1",
    state: "open",
    due: "2026-02-31T00:00:00Z",
  } as const;
  expect(resolveCountdown(def, NOW).kind).toBe("none");
  expect(dueSortKey(def)).toBe(Number.POSITIVE_INFINITY);
});

test("ISO 8601 以外の形式 (スラッシュ区切り '2026/02/31') は undefined 扱い", () => {
  const def = { name: "v0.1", state: "open", due: "2026/02/31" } as const;
  expect(resolveCountdown(def, NOW).kind).toBe("none");
});

test("先頭空白付き (' 2026-02-31') は undefined 扱い（厳密 ISO 8601 のみ受理）", () => {
  const def = { name: "v0.1", state: "open", due: " 2026-02-31" } as const;
  expect(resolveCountdown(def, NOW).kind).toBe("none");
});

test("日付の後ろに任意文字列が続く ('2026-06-21 foo') は undefined 扱い", () => {
  const def = { name: "v0.1", state: "open", due: "2026-06-21 foo" } as const;
  expect(resolveCountdown(def, NOW).kind).toBe("none");
});

test("ISO datetime の後ろに余り文字列 ('2026-06-21T00:00:00Z foo') が続く形式も undefined 扱い", () => {
  const def = {
    name: "v0.1",
    state: "open",
    due: "2026-06-21T00:00:00Z foo",
  } as const;
  expect(resolveCountdown(def, NOW).kind).toBe("none");
});

test("不正な ISO time suffix ('2026-06-21Tnot-a-date') は undefined 扱い", () => {
  const def = {
    name: "v0.1",
    state: "open",
    due: "2026-06-21Tnot-a-date",
  } as const;
  expect(resolveCountdown(def, NOW).kind).toBe("none");
});

test("範囲外の時刻 ('2026-06-21T25:99') は undefined 扱い", () => {
  const def = {
    name: "v0.1",
    state: "open",
    due: "2026-06-21T25:99",
  } as const;
  expect(resolveCountdown(def, NOW).kind).toBe("none");
});

test("妥当な ISO datetime ('2026-06-22T03:00:00Z') は受理される", () => {
  // 範囲内の HH:MM:SS と Z 付き TZ を受理し、calendar date として扱う
  const def = {
    name: "v0.1",
    state: "open",
    due: "2026-06-22T03:00:00Z",
  } as const;
  expect(resolveCountdown(def, NOW).kind).toBe("soon");
});

test("dueSortKey: due 未設定は +Infinity（末尾送り）", () => {
  expect(dueSortKey({ name: "v0.1" })).toBe(Number.POSITIVE_INFINITY);
});

test("dueSortKey: due が早い方が小さい値", () => {
  const a = dueSortKey({ name: "a", due: "2026-01-01" });
  const b = dueSortKey({ name: "b", due: "2026-12-31" });
  expect(a).toBeLessThan(b);
});
