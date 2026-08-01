import type { ProjectLoadWarning } from "@/domains/project-load-warning";

/** ProjectLoadWarning の一覧を要約する warning toast 文言を返す。 */
export const projectLoadWarningMessage = (
  warnings: readonly ProjectLoadWarning[],
): string => `読み込み時の注意が ${warnings.length} 件あります`;
