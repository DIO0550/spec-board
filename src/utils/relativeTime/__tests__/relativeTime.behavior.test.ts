import { expect, test } from "vitest";
import { formatRelativeTime } from "@/utils/relativeTime";

const NOW = new Date("2026-06-16T12:00:00Z");

test("1 分未満は『たった今』を返す", () => {
  const iso = new Date(NOW.getTime() - 30_000).toISOString();
  expect(formatRelativeTime(iso, NOW)).toBe("たった今");
});

test("N 分前を返す", () => {
  const iso = new Date(NOW.getTime() - 5 * 60_000).toISOString();
  expect(formatRelativeTime(iso, NOW)).toBe("5分前");
});

test("N 時間前を返す", () => {
  const iso = new Date(NOW.getTime() - 3 * 60 * 60_000).toISOString();
  expect(formatRelativeTime(iso, NOW)).toBe("3時間前");
});

test("1 日前は『昨日』を返す", () => {
  const iso = new Date(NOW.getTime() - 24 * 60 * 60_000).toISOString();
  expect(formatRelativeTime(iso, NOW)).toBe("昨日");
});

test("N 日前（2〜6 日）を返す", () => {
  const iso = new Date(NOW.getTime() - 5 * 24 * 60 * 60_000).toISOString();
  expect(formatRelativeTime(iso, NOW)).toBe("5日前");
});

test("7 日以上 30 日未満は『N週間前』を返す", () => {
  const iso = new Date(NOW.getTime() - 14 * 24 * 60 * 60_000).toISOString();
  expect(formatRelativeTime(iso, NOW)).toBe("2週間前");
});

test("30 日以上は『Nヶ月前』を返す", () => {
  const iso = new Date(NOW.getTime() - 35 * 24 * 60 * 60_000).toISOString();
  expect(formatRelativeTime(iso, NOW)).toBe("1ヶ月前");
});

test("365 日以上は YYYY/MM/DD 表記を返す", () => {
  const iso = new Date("2024-01-15T00:00:00Z").toISOString();
  expect(formatRelativeTime(iso, NOW)).toBe("2024/01/15");
});

test("パース不能な文字列はそのまま返す（lenient）", () => {
  expect(formatRelativeTime("not-a-date", NOW)).toBe("not-a-date");
});

test("未来の時刻も『たった今』として扱う（小さな時計ずれ吸収）", () => {
  const iso = new Date(NOW.getTime() + 10_000).toISOString();
  expect(formatRelativeTime(iso, NOW)).toBe("たった今");
});

test("許容時計ずれ（1 分）を超える未来は YYYY/MM/DD 表記へフォールバック", () => {
  // 2 分先の未来 → 時計ずれの範囲を超えているので「たった今」では隠さない
  const minutesAhead = new Date(NOW.getTime() + 2 * 60_000).toISOString();
  expect(formatRelativeTime(minutesAhead, NOW)).not.toBe("たった今");
  // 数日先 / 数年先も日付表記で返ること
  const daysAhead = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000);
  expect(formatRelativeTime(daysAhead.toISOString(), NOW)).toMatch(
    /^\d{4}\/\d{2}\/\d{2}$/,
  );
  const yearsAhead = new Date(NOW.getTime() + 365 * 24 * 60 * 60 * 1000 * 3);
  expect(formatRelativeTime(yearsAhead.toISOString(), NOW)).toMatch(
    /^\d{4}\/\d{2}\/\d{2}$/,
  );
});
