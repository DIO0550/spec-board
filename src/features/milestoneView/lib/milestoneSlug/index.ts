/**
 * マイルストーン名から表示・参照用のslugを生成する。
 * 作成フォームと詳細表示で同じ正規化規則を共有する。
 * @param name - マイルストーン名
 * @returns 正規化済みslug。入力が空になる場合は既定値。
 */
export const milestoneSlug = (name: string): string => {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  return slug || "version-tag";
};
