import { LabelDefinition } from "@/domains/label-definition";

// Storybook 専用モック。実アプリは Tauri backend（labels.yml）からラベルを取得するが、
// Storybook には backend が無いため、選択候補が見えるようサンプルラベルを返す。
// .storybook/main.ts の viteFinal で `@/hooks/useLabelList` をこのモジュールへ alias する。
const SAMPLE_LABELS = [
  LabelDefinition.fromWire({ name: "bug", color: "#e11d48" }),
  LabelDefinition.fromWire({ name: "feature", color: "#16a34a" }),
  LabelDefinition.fromWire({ name: "enhancement", color: "#2563eb" }),
  LabelDefinition.fromWire({ name: "documentation", color: "#d97706" }),
  LabelDefinition.fromWire({ name: "good first issue", color: "#7c3aed" }),
  LabelDefinition.fromWire({ name: "help wanted", color: "#0891b2" }),
];

/** Storybook 用の useLabelList モック（常に loaded + サンプルラベルを返す）。 */
export const useLabelList = () => ({
  kind: "loaded" as const,
  labels: SAMPLE_LABELS,
});
