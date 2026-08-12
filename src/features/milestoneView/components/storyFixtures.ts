import type { MilestoneDefinition } from "@/domains/milestone";
import type { MilestoneProjection } from "@/domains/milestone-projection";

export const STORY_NOW = new Date("2026-08-11T12:00:00Z");

export const OPEN_MILESTONE: MilestoneDefinition = {
  name: "v1.7",
  title: "v1.7 — レポート",
  description: "進捗バーンダウンと月次サマリーのエクスポート",
  due: "2026-10-05",
  state: "open",
  order: 1,
};

export const CLOSED_MILESTONE: MilestoneDefinition = {
  name: "v1.6",
  title: "v1.6 — 通知センター",
  description: "メンション通知とリアルタイム配信",
  due: "2026-07-20",
  state: "closed",
  order: 2,
};

export const STORY_PROJECTION: MilestoneProjection = {
  done: 6,
  total: 10,
  taskFilePaths: [],
};
