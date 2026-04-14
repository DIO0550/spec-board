import type { Task } from "../../../types/task";

/** 解決済みリンク（タスクが見つからない場合は task が undefined） */
export type ResolvedLink = {
	/** リンク先のファイルパス */
	filePath: string;
	/** 解決されたタスク（リンク切れの場合は undefined） */
	task: Task | undefined;
};

/** LinkSection の Props */
type LinkSectionProps = {
	/** 順方向リンクの配列 */
	links: ResolvedLink[];
	/** 逆方向リンクの配列 */
	reverseLinks: ResolvedLink[];
	/**
	 * タスク選択時のコールバック
	 * @param taskId - 選択されたタスクのID
	 */
	onTaskSelect: (taskId: string) => void;
	/**
	 * リンク削除時のコールバック
	 * @param filePath - 削除するリンクのファイルパス
	 */
	onRemoveLink: (filePath: string) => void;
	/** リンク追加ボタン押下時のコールバック（未指定時はボタン非表示） */
	onAddLink?: () => void;
};

/**
 * @param props - link: 解決済みリンク, onTaskSelect, onRemoveLink
 * @returns リンク行要素
 */
function LinkItem({
	link,
	onTaskSelect,
	onRemoveLink,
}: {
	link: ResolvedLink;
	onTaskSelect: (taskId: string) => void;
	onRemoveLink?: (filePath: string) => void;
}) {
	if (!link.task) {
		return (
			<li className="flex items-center gap-2 rounded px-2 py-1 text-sm text-gray-400">
				<span role="img" aria-label="リンク切れ">
					⚠
				</span>
				<span>{link.filePath}</span>
				{onRemoveLink && (
					<button
						type="button"
						aria-label={`リンク「${link.filePath}」を削除`}
						className="ml-auto text-gray-400 hover:text-red-500"
						onClick={() => onRemoveLink(link.filePath)}
					>
						×
					</button>
				)}
			</li>
		);
	}

	return (
		<li className="flex items-center gap-2">
			<button
				type="button"
				className="flex flex-1 items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-gray-100"
				onClick={() => link.task && onTaskSelect(link.task.id)}
			>
				<span>{link.task.title || link.task.filePath}</span>
			</button>
			{onRemoveLink && (
				<button
					type="button"
					aria-label={`リンク「${link.task.title || link.filePath}」を削除`}
					className="shrink-0 px-1 text-gray-400 hover:text-red-500"
					onClick={() => onRemoveLink(link.filePath)}
				>
					×
				</button>
			)}
		</li>
	);
}

/**
 * 関連リンクセクション（リンク一覧 + 追加・削除）
 * @param props - {@link LinkSectionProps}
 * @returns セクション要素。リンクが空の場合は null
 */
export function LinkSection({
	links,
	reverseLinks,
	onTaskSelect,
	onRemoveLink,
	onAddLink,
}: LinkSectionProps) {
	if (links.length === 0 && reverseLinks.length === 0) {
		return null;
	}

	return (
		<section data-testid="link-section" aria-label="関連リンク">
			<div className="mb-2 flex items-center justify-between">
				<h3 className="text-sm font-medium text-gray-700">関連リンク</h3>
				{onAddLink && (
					<button
						type="button"
						className="text-xs text-blue-600 hover:text-blue-800"
						data-testid="add-link-button"
						onClick={onAddLink}
					>
						+ リンク追加
					</button>
				)}
			</div>
			<ul className="space-y-1">
				{links.map((link) => (
					<LinkItem
						key={link.filePath}
						link={link}
						onTaskSelect={onTaskSelect}
						onRemoveLink={onRemoveLink}
					/>
				))}
				{reverseLinks.map((link) => (
					<LinkItem
						key={`reverse-${link.filePath}`}
						link={link}
						onTaskSelect={onTaskSelect}
					/>
				))}
			</ul>
		</section>
	);
}
