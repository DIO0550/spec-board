/** タスク DnD で使用する独自 MIME 型。外部 D&D を弾くための固定 string。 */
export const DRAG_MIME_TYPE = "application/x-spec-board-task" as const;

/** カラム DnD で使用する独自 MIME 型。タスク DnD と衝突しない固定 string。 */
export const COLUMN_DRAG_MIME_TYPE = "application/x-spec-board-column" as const;
