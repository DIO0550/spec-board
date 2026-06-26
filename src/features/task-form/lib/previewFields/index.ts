import { LabelsField } from "@/features/task-form/lib/fields/labels";
import {
  PreviewFrontmatter,
  type PreviewFrontmatter as PreviewFrontmatterType,
} from "@/features/task-form/lib/previewFrontmatter";

/**
 * フォーム各 hook から集約した生フィールド値。
 * `useTaskFormFields` の scalar 値 + `useLabelsInput` の `LabelsField` state +
 * `useLinksInput` の `string[]` を 1 つの DTO に束ね、PreviewFrontmatter への
 * 変換境界（companion `PreviewFields.toPreviewFrontmatter`）の引数として受ける。
 */
export type PreviewFieldsInput = {
  title: string;
  status: string;
  /** PriorityField（`Priority | ""`）を string として受ける。 */
  priority: string;
  /** `useTaskFormFields` の `parent` 値。未指定（親フィールド非表示時）は undefined */
  parent: string | undefined;
  /** `useLabelsInput` の state（未コミット labelInput も含む生形）。 */
  labels: LabelsField;
  /** `useLinksInput` から取得した確定済み filePath 配列。 */
  links: string[];
  due: string;
  draft: boolean;
};

/**
 * フォーム由来の生フィールドを `PreviewFrontmatter` に変換する adapter companion。
 * `parent` の undefined → `""` 正規化、`labels` の未コミット入力取り込み
 *（`LabelsField.finalize`）など、複数 hook 由来の入力を 1 箇所に集約して
 * `PreviewFrontmatter.from` の入力形に整形する。
 */
export const PreviewFields = {
  /**
   * 生フィールド値からブランド付き `PreviewFrontmatter` を生成する。
   * cast は `PreviewFrontmatter.from` に委譲し、本 companion 内では cast を持たない。
   * @param input - 各 hook から集約した生フィールド値
   * @returns ブランド付き `PreviewFrontmatter` 値
   */
  toPreviewFrontmatter: (input: PreviewFieldsInput): PreviewFrontmatterType =>
    PreviewFrontmatter.from({
      title: input.title,
      status: input.status,
      priority: input.priority,
      parent: input.parent ?? "",
      labels: LabelsField.finalize(input.labels),
      links: input.links,
      due: input.due,
      draft: input.draft,
    }),
};
