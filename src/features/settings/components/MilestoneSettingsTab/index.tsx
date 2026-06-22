import { useState } from "react";
import { Milestone } from "@/domains/milestone";
import type { MilestonesResource } from "@/hooks/useMilestones";
import type { CreateMilestoneArgs, MilestoneDefinition } from "@/lib/tauri";
import type { UseMilestoneMutationsResult } from "../../hooks/useMilestoneMutations";

/** 編集フォームの入力値（すべて文字列で保持し、送信時に正規化する）。 */
type FormValues = {
  name: string;
  title: string;
  due: string;
  order: string;
  state: string;
};

const EMPTY_FORM: FormValues = {
  name: "",
  title: "",
  due: "",
  order: "",
  state: "",
};

/** 非負整数のみ（先頭末尾空白許容）を表す order の検証パターン。 */
const NON_NEGATIVE_INTEGER = /^\d+$/;

/**
 * order 入力を非負整数 or undefined に正規化する。
 * `Number.parseInt` は "1.5" / "2abc" を 1 / 2 と部分パースしてしまうため、
 * 文字列全体が整数のときだけ採用し、それ以外（小数・余剰文字・空）は undefined に倒す。
 * @param raw - order の生入力
 * @returns 非負整数、または未割当を表す undefined
 */
const toOrder = (raw: string): number | undefined => {
  const trimmed = raw.trim();
  if (!NON_NEGATIVE_INTEGER.test(trimmed)) {
    return undefined;
  }
  return Number.parseInt(trimmed, 10);
};

/**
 * フォーム入力値を CreateMilestoneArgs に正規化する。
 * 空文字フィールドは undefined（未割当）に倒す。order は文字列全体が非負整数のときのみ採用。
 * @param values - フォーム入力値
 * @returns 送信用 args
 */
const toArgs = (values: FormValues): CreateMilestoneArgs => {
  return {
    name: values.name,
    title: values.title === "" ? undefined : values.title,
    due: values.due === "" ? undefined : values.due,
    order: toOrder(values.order),
    state: values.state === "" ? undefined : values.state,
  };
};

/**
 * 既存定義をフォーム初期値に変換する。
 * @param def - マイルストーン定義
 * @returns フォーム値
 */
const toForm = (def: MilestoneDefinition): FormValues => ({
  name: def.name,
  title: def.title ?? "",
  due: def.due ?? "",
  order: def.order === undefined ? "" : String(def.order),
  state: def.state ?? "",
});

type MilestoneSettingsTabProps = {
  /** App / SettingsScreen から配られるマイルストーンリソース（唯一の取得点） */
  resource: MilestonesResource;
  /**
   * App が hoist して保持するマイルストーン CRUD ハンドル。
   * 設定タブとマイルストーンビューで同一インスタンスを共有することで、
   * 画面遷移を跨いだ並行書き込みを直列化する（in-flight ガードを共有）。
   */
  mutations: UseMilestoneMutationsResult;
};

/**
 * マイルストーン管理タブ（CRUD）。一覧は楽観更新せず、mutation 成功後に
 * `resource.reload` で確定する。取得は `useMilestones`（resource）に委譲し、
 * 本コンポーネントは独自に getMilestones を呼ばない。
 * @param props - {@link MilestoneSettingsTabProps}
 * @returns マイルストーン管理パネル
 */
export const MilestoneSettingsTab = ({
  resource,
  mutations,
}: MilestoneSettingsTabProps) => {
  const { milestones, usageCounts, status } = resource;
  const { isPending, create, update, remove } = mutations;
  // 編集対象の name（null は新規作成モード）。
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);

  /**
   * 入力フィールドを更新する。
   * @param key - 更新するフィールド
   * @param value - 新しい値
   */
  const setField = (key: keyof FormValues, value: string): void => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  /** フォームを新規作成モードにリセットする。 */
  const resetForm = (): void => {
    setEditingName(null);
    setForm(EMPTY_FORM);
  };

  /** フォーム送信（新規作成 or 更新）。成功時はフォームをリセットする。 */
  const handleSubmit = async (): Promise<void> => {
    const args = toArgs(form);
    if (editingName === null) {
      const created = await create(args);
      if (created) {
        resetForm();
      }
      return;
    }
    // 更新は PUT セマンティクスで未指定フィールドがクリアされるため、UI で編集できない
    // description は既存定義の値を引き継いで消失を防ぐ。
    const existing = milestones.find((def) => def.name === editingName);
    const updated = await update({
      ...args,
      name: editingName,
      description: existing?.description,
    });
    if (updated) {
      resetForm();
    }
  };

  /**
   * 既存マイルストーンを編集モードに切り替える。
   * @param def - 編集する定義
   */
  const startEdit = (def: MilestoneDefinition): void => {
    setEditingName(def.name);
    setForm(toForm(def));
  };

  /**
   * マイルストーンを削除する（使用数を確認のうえ）。
   * @param name - 削除対象の name
   */
  const handleDelete = async (name: string): Promise<void> => {
    const count = usageCounts[name] ?? 0;
    const message =
      count > 0
        ? `「${name}」は ${count} 件のタスクで使用中です。削除しますか？（タスクの値は残ります）`
        : `「${name}」を削除しますか？`;
    if (!globalThis.confirm(message)) {
      return;
    }
    await remove(name);
    if (editingName === name) {
      resetForm();
    }
  };

  if (status === "loading" || status === "idle") {
    return <p className="text-sm text-muted">読み込み中…</p>;
  }
  if (status === "error") {
    return (
      <p className="text-sm text-muted">マイルストーンを読み込めませんでした</p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-1">
        {milestones.length === 0 ? (
          <li className="text-sm text-muted">マイルストーンなし</li>
        ) : (
          milestones.map((def) => (
            <li
              key={def.name}
              className="flex items-center gap-2 text-sm"
              data-testid="milestone-row"
            >
              <span className="font-medium">
                {Milestone.badgeLabel(def.name, def)}
              </span>
              <span className="text-muted">{def.name}</span>
              {def.due !== undefined ? (
                <span className="text-muted">{def.due}</span>
              ) : null}
              <span className="text-muted">
                使用 {usageCounts[def.name] ?? 0}
              </span>
              <button
                type="button"
                className="text-accent"
                onClick={() => startEdit(def)}
              >
                編集
              </button>
              <button
                type="button"
                className="text-red-600 disabled:opacity-50"
                disabled={isPending}
                onClick={() => {
                  void handleDelete(def.name);
                }}
              >
                削除
              </button>
            </li>
          ))
        )}
      </ul>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
      >
        <input
          aria-label="name"
          placeholder="name（必須）"
          value={form.name}
          disabled={editingName !== null}
          onChange={(e) => setField("name", e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        />
        <input
          aria-label="title"
          placeholder="title"
          value={form.title}
          onChange={(e) => setField("title", e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        />
        <input
          aria-label="due"
          placeholder="due（例: 2026-07-31）"
          value={form.due}
          onChange={(e) => setField("due", e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        />
        <input
          aria-label="order"
          placeholder="order（非負整数）"
          value={form.order}
          onChange={(e) => setField("order", e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        />
        <select
          aria-label="state"
          value={form.state}
          onChange={(e) => setField("state", e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="">（未指定）</option>
          <option value="open">open</option>
          <option value="closed">closed</option>
        </select>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={form.name === "" || isPending}
            className="rounded bg-accent px-3 py-1 text-sm text-accent-foreground disabled:opacity-50"
          >
            {editingName === null ? "作成" : "更新"}
          </button>
          {editingName !== null ? (
            <button
              type="button"
              className="rounded border px-3 py-1 text-sm"
              onClick={resetForm}
            >
              キャンセル
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
};
