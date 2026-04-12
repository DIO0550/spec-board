/** 優先度 */
export type Priority = "High" | "Medium" | "Low";

/** タスク */
export type Task = {
	/** 一意な識別子 */
	id: string;
	/** タスクタイトル */
	title: string;
	/** ステータス（カラム名に対応） */
	status: string;
	/** 優先度（未設定の場合は undefined） */
	priority: Priority | undefined;
	/** ラベルの配列 */
	labels: string[];
	/** 親タスクのファイルパス */
	parent: string | undefined;
	/** 関連タスクのファイルパスの配列 */
	links: string[];
	/** 子タスクのファイルパスの配列（parent から逆引き） */
	children: string[];
	/** 逆方向リンクのファイルパスの配列（links から逆引き） */
	reverseLinks: string[];
	/** Markdown 本文 */
	body: string;
	/** タスクファイルのパス */
	filePath: string;
};

/** カラム定義 */
export type Column = {
	/** カラム名 */
	name: string;
	/** 表示順序 */
	order: number;
};

/** プロジェクト設定 */
export type ProjectConfig = {
	/** スキーマバージョン */
	version: number;
	/** カラム定義の配列 */
	columns: Column[];
	/** カラムごとのカード表示順（カラム名 → ファイルパスの配列） */
	cardOrder: Record<string, string[]>;
	/** 完了として扱うカラム名 */
	doneColumn: string;
};
