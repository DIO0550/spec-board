import {
	type FormEvent,
	type KeyboardEvent,
	useCallback,
	useEffect,
	useId,
	useState,
} from "react";
import type { Column, Priority, Task } from "../../../types/task";
import { ParentTaskSelect } from "./ParentTaskSelect";

/** TaskForm から送信される値 */
export type TaskFormValues = {
	/** タイトル（必須、空文字不可） */
	title: string;
	/** ステータス（必須） */
	status: string;
	/** 優先度（任意） */
	priority?: Priority;
	/** ラベル一覧 */
	labels: string[];
	/** 親タスクのファイルパス（任意） */
	parent?: string;
	/** 本文（Markdown） */
	body: string;
};

type TaskFormProps = {
	/** 選択肢となるカラム一覧 */
	columns: Column[];
	/** ステータスの初期値 */
	initialStatus: string;
	/** 親タスクの選択候補。未指定の場合は親タスクフィールド自体を非表示にする */
	parentCandidates?: Task[];
	/** 親タスクの初期値（サブIssue 追加時の自動設定用） */
	initialParent?: string;
	/** 送信中かどうか（true の間は送信ボタンと入力欄が無効化される） */
	isSubmitting?: boolean;
	/** 送信ボタンのラベル（デフォルト: "作成"） */
	submitLabel?: string;
	/** キャンセルボタンのラベル（デフォルト: "キャンセル"） */
	cancelLabel?: string;
	/**
	 * 送信時のコールバック。バリデーション通過後に呼ばれる。
	 * @param values - フォームの入力値
	 */
	onSubmit: (values: TaskFormValues) => void;
	/** キャンセル時のコールバック */
	onCancel: () => void;
};

const PRIORITY_OPTIONS: readonly Priority[] = ["High", "Medium", "Low"];

/**
 * 各フィールドの生値を TaskFormValues に正規化する。
 * タイトルは前後空白を trim し、空文字の優先度は undefined に変換する。
 * @param title - タイトル
 * @param status - ステータス
 * @param priority - 優先度（空文字はなし扱い）
 * @param labels - ラベル一覧
 * @param parent - 親タスクのファイルパス
 * @param body - 本文
 * @returns 正規化済みのフォーム送信値
 */
function normalizeSubmission(
	title: string,
	status: string,
	priority: Priority | "",
	labels: string[],
	parent: string | undefined,
	body: string,
): TaskFormValues {
	return {
		title: title.trim(),
		status,
		priority: priority === "" ? undefined : priority,
		labels,
		parent,
		body,
	};
}

/**
 * タスク作成フォーム。
 * タイトル・ステータス・優先度・ラベル・本文を入力し、バリデーションを通過した値を `onSubmit` に渡す。
 *
 * @param props - {@link TaskFormProps}
 * @returns フォーム要素
 */
export function TaskForm({
	columns,
	initialStatus,
	parentCandidates,
	initialParent,
	isSubmitting = false,
	submitLabel = "作成",
	cancelLabel = "キャンセル",
	onSubmit,
	onCancel,
}: TaskFormProps) {
	const [title, setTitle] = useState("");
	const [status, setStatus] = useState(initialStatus);
	const [priority, setPriority] = useState<Priority | "">("");
	const [labels, setLabels] = useState<string[]>([]);
	const [labelInput, setLabelInput] = useState("");
	const [parent, setParent] = useState<string | undefined>(
		parentCandidates !== undefined ? initialParent : undefined,
	);
	const parentFieldVisible = parentCandidates !== undefined;
	useEffect(() => {
		setParent(parentFieldVisible ? initialParent : undefined);
	}, [parentFieldVisible, initialParent]);
	const [body, setBody] = useState("");
	const [titleError, setTitleError] = useState<string | null>(null);

	const id = useId();
	const titleId = `${id}-title`;
	const statusId = `${id}-status`;
	const priorityId = `${id}-priority`;
	const labelsId = `${id}-labels`;
	const bodyId = `${id}-body`;
	const titleErrorId = `${id}-title-error`;

	const commitLabel = useCallback(() => {
		const trimmed = labelInput.trim();
		if (trimmed.length === 0) return;
		setLabels((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
		setLabelInput("");
	}, [labelInput]);

	const removeLabel = useCallback((target: string) => {
		setLabels((prev) => prev.filter((l) => l !== target));
	}, []);

	const handleLabelKeyDown = useCallback(
		(e: KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Enter") {
				e.preventDefault();
				commitLabel();
			}
		},
		[commitLabel],
	);

	const handleSubmit = useCallback(
		(e: FormEvent<HTMLFormElement>) => {
			e.preventDefault();
			if (isSubmitting) return;
			if (title.trim().length === 0) {
				setTitleError("タイトルを入力してください");
				return;
			}
			setTitleError(null);
			const pending = labelInput.trim();
			const finalLabels =
				pending.length > 0 && !labels.includes(pending)
					? [...labels, pending]
					: labels;
			if (pending.length > 0) {
				setLabels(finalLabels);
				setLabelInput("");
			}
			const values = normalizeSubmission(
				title,
				status,
				priority,
				finalLabels,
				parent,
				body,
			);
			onSubmit(values);
		},
		[
			isSubmitting,
			title,
			status,
			priority,
			labels,
			labelInput,
			parent,
			body,
			onSubmit,
		],
	);

	return (
		<form
			className="flex flex-col gap-4"
			data-testid="task-form"
			noValidate
			onSubmit={handleSubmit}
		>
			<div>
				<label
					htmlFor={titleId}
					className="mb-1 block text-xs font-medium text-gray-700"
				>
					タイトル <span className="text-red-600">*</span>
				</label>
				<input
					id={titleId}
					type="text"
					value={title}
					onChange={(e) => {
						setTitle(e.target.value);
						if (titleError) setTitleError(null);
					}}
					disabled={isSubmitting}
					aria-invalid={titleError !== null}
					aria-describedby={titleError ? titleErrorId : undefined}
					className="w-full rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-blue-500 disabled:bg-gray-100"
					data-testid="task-form-title"
				/>
				{titleError && (
					<p
						id={titleErrorId}
						className="mt-1 text-xs text-red-600"
						data-testid="task-form-title-error"
					>
						{titleError}
					</p>
				)}
			</div>

			<div>
				<label
					htmlFor={statusId}
					className="mb-1 block text-xs font-medium text-gray-700"
				>
					ステータス <span className="text-red-600">*</span>
				</label>
				<select
					id={statusId}
					value={status}
					onChange={(e) => setStatus(e.target.value)}
					disabled={isSubmitting}
					className="w-full rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-blue-500 disabled:bg-gray-100"
					data-testid="task-form-status"
				>
					{columns.map((col) => (
						<option key={col.name} value={col.name}>
							{col.name}
						</option>
					))}
				</select>
			</div>

			<div>
				<label
					htmlFor={priorityId}
					className="mb-1 block text-xs font-medium text-gray-700"
				>
					優先度
				</label>
				<select
					id={priorityId}
					value={priority}
					onChange={(e) => setPriority(e.target.value as Priority | "")}
					disabled={isSubmitting}
					className="w-full rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-blue-500 disabled:bg-gray-100"
					data-testid="task-form-priority"
				>
					<option value="">なし</option>
					{PRIORITY_OPTIONS.map((p) => (
						<option key={p} value={p}>
							{p}
						</option>
					))}
				</select>
			</div>

			<div>
				<label
					htmlFor={labelsId}
					className="mb-1 block text-xs font-medium text-gray-700"
				>
					ラベル
				</label>
				<div className="flex flex-wrap items-center gap-1.5">
					{labels.map((label) => (
						<span
							key={label}
							className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700"
						>
							{label}
							<button
								type="button"
								aria-label={`ラベル「${label}」を削除`}
								className="ml-0.5 rounded text-gray-400 hover:text-gray-700"
								disabled={isSubmitting}
								onClick={() => removeLabel(label)}
							>
								×
							</button>
						</span>
					))}
					<input
						id={labelsId}
						type="text"
						value={labelInput}
						onChange={(e) => setLabelInput(e.target.value)}
						onKeyDown={handleLabelKeyDown}
						onBlur={commitLabel}
						disabled={isSubmitting}
						placeholder="Enter で追加"
						className="flex-1 min-w-[100px] rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-blue-500 disabled:bg-gray-100"
						data-testid="task-form-label-input"
					/>
				</div>
			</div>

			{parentCandidates !== undefined && (
				<ParentTaskSelect
					tasks={parentCandidates}
					value={parent}
					onChange={setParent}
					disabled={isSubmitting}
				/>
			)}

			<div>
				<label
					htmlFor={bodyId}
					className="mb-1 block text-xs font-medium text-gray-700"
				>
					説明
				</label>
				<textarea
					id={bodyId}
					value={body}
					onChange={(e) => setBody(e.target.value)}
					disabled={isSubmitting}
					rows={4}
					className="w-full rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-blue-500 disabled:bg-gray-100"
					data-testid="task-form-body"
				/>
			</div>

			<div className="mt-2 flex justify-end gap-3">
				<button
					type="button"
					className="rounded px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
					disabled={isSubmitting}
					onClick={onCancel}
					data-testid="task-form-cancel"
				>
					{cancelLabel}
				</button>
				<button
					type="submit"
					className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
					disabled={isSubmitting}
					data-testid="task-form-submit"
				>
					{submitLabel}
				</button>
			</div>
		</form>
	);
}
