// @lint-suppress-ok overlay は ConfirmDialog と同じく div role="presentation"
// で実装する。a11y ツリーへインタラクティブ要素を露出させないためで、Escape /
// 閉じる × ボタンでキーボード経路は別途確保している。
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import type { CreateMilestoneArgs } from "@/lib/tauri";

/** モーダル内フォームの入力値（全て文字列で保持し、送信時に正規化する）。 */
type FormValues = {
  name: string;
  title: string;
  due: string;
  description: string;
};

const EMPTY_FORM: FormValues = {
  name: "",
  title: "",
  due: "",
  description: "",
};

type MilestoneCreateModalProps = {
  /** モーダル左上に表示するサブタイトル（例: `payments-service · milestones.yml`） */
  subtitle?: string;
  /**
   * 作成リクエストを実行する。成功なら true、失敗 / pending 中なら false。
   * @param args - 作成内容
   * @returns 成功なら true
   */
  onCreate: (args: CreateMilestoneArgs) => Promise<boolean>;
  /** 親が共有する pending 中フラグ（送信ボタン disabled に使う） */
  isPending: boolean;
  /** Suggested labels for the optional metadata field. */
  labelOptions?: readonly string[];
  /** Suggested assignees for the optional metadata field. */
  assigneeOptions?: readonly string[];
  /** Reports the normalized comma-separated label selection. */
  onLabelsChange?: (labels: readonly string[]) => void;
  /** Reports the optional assignee selection. */
  onAssigneeChange?: (assignee: string) => void;
  /** キャンセル / 成功で閉じるときに呼ばれる */
  onClose: () => void;
};

/**
 * フォーム入力値を CreateMilestoneArgs に正規化する。
 *
 * `name` は config-spec で「unnormalized 完全一致キー」と定義されているため、
 * 既存タスクの frontmatter `milestone:` 値と合わせるためにトリムせずそのまま送る
 * （MilestoneSettingsTab の toArgs と同じ扱い）。空文字のみ呼び出し側でバリデーションする。
 *
 * `title` / `due` / `description` は任意項目。空文字は undefined に倒し
 * 「未設定」を表す（前後空白の保持は意味が薄いためトリムする）。
 *
 * @param values - フォーム入力値
 * @returns 送信用 args
 */
const toArgs = (values: FormValues): CreateMilestoneArgs => {
  const opt = (s: string): string | undefined => {
    const trimmed = s.trim();
    return trimmed === "" ? undefined : trimmed;
  };
  return {
    name: values.name,
    title: opt(values.title),
    due: opt(values.due),
    description: opt(values.description),
  };
};

/**
 * マイルストーン作成モーダル。仕様: docs/spec-board/milestone-view-spec.md（作成モーダル節）。
 * 名前 / 表示名 / 期日 / 説明 の 4 入力。`name` のみ必須でそれ以外は任意。
 * Esc / overlay クリック / キャンセルで閉じる。送信成功で `onClose` を呼ぶ。
 *
 * z-index は ConfirmDialog と同じ語彙 (overlay=z-[60] / dialog=z-[70]) を踏襲する。
 *
 * @param props - {@link MilestoneCreateModalProps}
 * @returns モーダル要素
 */
export const MilestoneCreateModal = ({
  subtitle,
  onCreate,
  isPending,
  labelOptions = [],
  assigneeOptions = [],
  onLabelsChange,
  onAssigneeChange,
  onClose,
}: MilestoneCreateModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [isNameTouched, setIsNameTouched] = useState(false);
  const [labels, setLabels] = useState("");
  const [assignee, setAssignee] = useState("");
  const autoSlug =
    form.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "") || "version-tag";

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // IME 変換中の Escape は候補キャンセル用なのでモーダル閉じへ消費しない。
      // TaskCreateScreen 等の他画面と同じ isComposing ガードを適用する。
      if (e.isComposing) {
        return;
      }
      if (e.key === "Escape" && !isPending) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, isPending]);

  // 送信値は spec 上「unnormalized 完全一致キー」のためトリムせずそのまま渡すが、
  // バリデーションは trim 後の空判定で「空白のみの name」も拒否する（実質的に空のまま
  // マスタが作られるのを防ぐ）。
  const canSubmit = form.name.trim() !== "" && !isPending;

  /**
   * 作成ボタン押下時のサブミットハンドラ。
   * @param e - フォームイベント
   */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) {
      return;
    }
    const ok = await onCreate(toArgs(form));
    if (ok) {
      setForm(EMPTY_FORM);
      onClose();
    }
  };

  return (
    <>
      {/* ConfirmDialog と同じく overlay は a11y ツリーへ露出させない静的要素。
          キーボード閉じは Escape / 閉じる × ボタン側で担保。 */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: overlay dismisses dialog on click; Escape handled separately */}
      <div
        role="presentation"
        data-testid="milestone-create-overlay"
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]"
        onClick={isPending ? undefined : onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="milestone-create-modal"
        className="fixed top-1/2 left-1/2 z-[70] w-[560px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
      >
        <header className="flex items-center gap-3 border-b border-border px-5 py-3">
          <span
            aria-hidden="true"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"
          >
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 4v16M4 4h12l-2 4 2 4H4" />
            </svg>
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <h2
              id={titleId}
              className="text-[14.5px] font-semibold text-foreground"
            >
              マイルストーンを追加
            </h2>
            {subtitle !== undefined ? (
              <span className="truncate font-mono text-[11px] text-muted">
                {subtitle}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            data-testid="milestone-create-close"
            onClick={onClose}
            disabled={isPending}
            className="rounded p-1 text-muted hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="閉じる"
          >
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-4">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              名前
            </span>
            <input
              type="text"
              required
              autoComplete="off"
              data-testid="milestone-create-name"
              value={form.name}
              onBlur={() => setIsNameTouched(true)}
              aria-invalid={isNameTouched && form.name.trim() === ""}
              aria-describedby={
                isNameTouched && form.name.trim() === ""
                  ? `${id}-name-error`
                  : undefined
              }
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="v1.7"
              className="rounded-md border border-border bg-surface-muted px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            />
            {isNameTouched && form.name.trim() === "" ? (
              <span
                id={`${id}-name-error`}
                data-testid="milestone-create-name-error"
                className="text-[11px] text-[var(--color-ms-danger-fg)]"
              >
                名前を入力してください
              </span>
            ) : (
              <span
                data-testid="milestone-create-slug"
                className="font-mono text-[10.5px] text-muted"
              >
                milestones.yml → {autoSlug}
              </span>
            )}
          </label>

          <div className="grid grid-cols-[1fr_150px] gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                表示名
              </span>
              <input
                type="text"
                autoComplete="off"
                data-testid="milestone-create-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="通知センター"
                className="rounded-md border border-border bg-surface-muted px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                期日
              </span>
              <input
                type="date"
                data-testid="milestone-create-due"
                value={form.due}
                onChange={(e) => setForm({ ...form, due: e.target.value })}
                className="rounded-md border border-border bg-surface-muted px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Labels — 任意
              </span>
              <input
                data-testid="milestone-create-labels"
                list={`${id}-labels`}
                value={labels}
                onChange={(event) => {
                  const value = event.target.value;
                  setLabels(value);
                  onLabelsChange?.(
                    value
                      .split(",")
                      .map((label) => label.trim())
                      .filter(Boolean),
                  );
                }}
                placeholder="release, frontend"
                className="rounded-md border border-border bg-surface-muted px-2 py-1.5 text-sm text-foreground"
              />
              <datalist id={`${id}-labels`}>
                {labelOptions.map((label) => (
                  <option key={label} value={label} />
                ))}
              </datalist>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Assignee — 任意
              </span>
              <select
                data-testid="milestone-create-assignee"
                value={assignee}
                onChange={(event) => {
                  setAssignee(event.target.value);
                  onAssigneeChange?.(event.target.value);
                }}
                className="rounded-md border border-border bg-surface-muted px-2 py-1.5 text-sm text-foreground"
              >
                <option value="">未割り当て</option>
                {assigneeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              説明 — 任意
            </span>
            <textarea
              rows={3}
              data-testid="milestone-create-description"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="このマイルストーンで達成したいこと"
              className="rounded-md border border-border bg-surface-muted px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            />
          </label>

          <footer className="-mx-5 -mb-4 mt-2 flex items-center justify-between gap-2 border-t border-border bg-surface-muted px-5 py-3">
            <span className="font-mono text-[11px] text-muted">
              作成時に <code>milestones.yml</code> へ追記
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-foreground hover:border-border disabled:cursor-not-allowed disabled:opacity-60"
              >
                キャンセル
              </button>
              <button
                type="submit"
                data-testid="milestone-create-submit"
                disabled={!canSubmit}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "作成中…" : "マイルストーンを作成"}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </>
  );
};
