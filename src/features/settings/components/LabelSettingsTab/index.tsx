import { useMemo, useRef, useState } from "react";
import {
  filterLabels,
  type LabelGroupFilter,
  type LabelSort,
  labelColorTally,
  labelGroupCounts,
  labelStats,
  sortLabels,
} from "@/features/settings/lib/labelSettings/derive";
import type { LabelsResource } from "@/hooks/useLabels";
import {
  type CreateLabelArgs,
  exportLabels,
  type LabelDefinition,
  saveFileDialog,
} from "@/lib/tauri";
import { getToastSink } from "@/lib/tauri/toastSink";
import { useLabelMutations } from "../../hooks/useLabelMutations";
import {
  CreateLabelForm,
  EMPTY_LABEL_FORM,
  type LabelFormValues,
} from "./CreateLabelForm";
import { LabelFilterBar } from "./LabelFilterBar";
import { LabelFooterTally } from "./LabelFooterTally";
import { LabelStatsHeader } from "./LabelStatsHeader";
import { LabelTable } from "./LabelTable";

/**
 * ラベル定義 → フォーム初期値。
 * @param def - ラベル定義
 * @returns フォーム値
 */
const toForm = (def: LabelDefinition): LabelFormValues => ({
  name: def.name,
  description: def.description ?? "",
  group: def.group ?? "",
  color: def.color ?? "",
});

/**
 * フォーム入力値を CreateLabelArgs に正規化する。空文字は undefined に倒し、
 * BE が group/color を skip_serializing_if で省略 / lenient 既定色化できるようにする。
 * @param values - フォーム入力値
 * @returns 送信用 args
 */
const toArgs = (values: LabelFormValues): CreateLabelArgs => {
  // 各フィールドは送信前に trim する。空白のみの入力 ("   ") は
  // LabelRegistry.effectiveGroup（trim 比較）と整合するよう undefined に正規化する。
  const trimmedDescription = values.description.trim();
  const trimmedGroup = values.group.trim();
  const trimmedColor = values.color.trim();
  return {
    name: values.name.trim(),
    description: trimmedDescription === "" ? undefined : trimmedDescription,
    group: trimmedGroup === "" ? undefined : trimmedGroup,
    color: trimmedColor === "" ? undefined : trimmedColor,
  };
};

type LabelSettingsTabProps = {
  /** App / SettingsScreen から配られるラベルリソース（唯一の取得点・live usageCounts 上書き済み） */
  resource: LabelsResource;
  /**
   * 使用数クリックで board へ遷移しラベル絞り込みを適用するためのコールバック。
   * @param labelName - クリックされたラベル名
   */
  onLabelUsageClick: (labelName: string) => void;
};

/**
 * ラベル管理タブ（CRUD + フィルタ + ソート + 統計 + エクスポート + 使用数リンク）。
 * 一覧は楽観更新せず、mutation 成功後に `resource.reload` で確定する。取得は
 * `useLabels`（resource）に委譲し、本コンポーネントは独自に getLabels を呼ばない。
 * 削除確認は `globalThis.confirm` を使い、使用数 0 / >0 で文言を分岐させる。
 * @param props - {@link LabelSettingsTabProps}
 * @returns ラベル管理パネル
 */
export const LabelSettingsTab = ({
  resource,
  onLabelUsageClick,
}: LabelSettingsTabProps) => {
  const { labels, usageCounts, status, reload } = resource;
  const { isPending, create, update, remove } = useLabelMutations(reload);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<LabelFormValues>(EMPTY_LABEL_FORM);
  // export 専用の in-flight ガード。state は disabled 表示用、ref は連打レース防止用
  // （state 反映前の click でも ref で即時ガードされる）。
  const [isExporting, setIsExporting] = useState(false);
  const isExportingRef = useRef(false);
  const [keyword, setKeyword] = useState("");
  const [groupFilter, setGroupFilter] = useState<LabelGroupFilter>({
    kind: "all",
  });
  const [sort, setSort] = useState<LabelSort>("name");

  const filtered = useMemo(
    () => filterLabels(labels, keyword, groupFilter),
    [labels, keyword, groupFilter],
  );
  const sorted = useMemo(
    () => sortLabels(filtered, sort, usageCounts),
    [filtered, sort, usageCounts],
  );
  const stats = useMemo(
    () => labelStats(labels, usageCounts),
    [labels, usageCounts],
  );
  const groupCounts = useMemo(() => labelGroupCounts(labels), [labels]);
  const colorTally = useMemo(
    () => labelColorTally(labels, usageCounts),
    [labels, usageCounts],
  );
  // 相対時刻表示の基準時刻を 1 回だけ生成し、全行へ流す。`labels` が入れ替わった
  // タイミングで作り直して「数秒〜分単位で古い相対時刻」が残るのを避ける。labels が
  // 同一参照を保つ限り基準は固定で、フォーム入力の度に再生成しない（labels への参照は
  // 「labels が変わった時だけ再生成する」意図を biome へ伝えるためのもの）。
  const now = useMemo(() => {
    void labels;
    return new Date();
  }, [labels]);

  /**
   * フォームのフィールドを更新する。
   * @param key - 更新するフィールド名
   * @param value - 新しい値
   */
  const setField = (key: keyof LabelFormValues, value: string): void => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  /** フォームを新規モードへリセットする。 */
  const resetForm = (): void => {
    setEditingName(null);
    setForm(EMPTY_LABEL_FORM);
  };

  /**
   * 編集モードへ切り替える。
   * @param def - 編集対象のラベル定義
   */
  const startEdit = (def: LabelDefinition): void => {
    setEditingName(def.name);
    setForm(toForm(def));
  };

  /** フォーム送信（新規作成 or 更新）。成功時はフォームをリセットする。 */
  const handleSubmit = async (): Promise<void> => {
    const args = toArgs(form);
    if (args.name === "") {
      return;
    }
    if (editingName === null) {
      const created = await create(args);
      if (created) {
        resetForm();
      }
      return;
    }
    // 更新は PUT セマンティクスで「未指定フィールドはクリア」される。`toArgs` が空文字を
    // undefined に倒すため、ユーザーがフォームを空欄にしたまま送信すると、そのフィールドの
    // 既存値（description / group / color）はクリアされる挙動になる（UI で削除を表現する経路）。
    // UI で全フィールド編集可なため、form 値をそのまま送って良い（name は固定）。
    const updated = await update({ ...args, name: editingName });
    if (updated) {
      resetForm();
    }
  };

  /**
   * 削除確認 → mutation 実行。編集中対象なら resetForm へ戻す。
   * @param name - 削除対象 name
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

  /**
   * エクスポート（save ダイアログ → exportLabels invoke）。
   * 失敗 3 系統: (1) save() 例外は invoke allowlist 外で共通トーストが拾わないため、
   * ここで明示的に sink へトーストを上げて中断する（サイレント失敗を防ぐ）。
   * (2) ユーザーキャンセル(null) は no-op。
   * (3) BE export_labels 失敗は invoke allowlist 内で共通トーストが発火するため
   * 本関数では別途処理しない。
   */
  const handleExport = async (): Promise<void> => {
    // 連打ガード: state 反映前の click でも ref で即時に弾く。
    if (isExportingRef.current) {
      return;
    }
    isExportingRef.current = true;
    setIsExporting(true);
    try {
      const picked = await saveFileDialog({
        defaultPath: "labels.yml",
        filters: [{ name: "YAML", extensions: ["yml", "yaml"] }],
      });
      if (!picked.ok) {
        const sink = getToastSink();
        if (sink !== null) {
          sink(
            `ラベルのエクスポートに失敗しました: ${picked.error.message}`,
            "error",
          );
        }
        return;
      }
      if (picked.value === null) {
        return;
      }
      await exportLabels({ path: picked.value });
    } finally {
      // ガード解除は ref と state の両方を必ず戻す。
      isExportingRef.current = false;
      setIsExporting(false);
    }
  };

  if (status === "idle") {
    return (
      <p className="text-sm text-muted">
        プロジェクトを開くとラベルを表示します
      </p>
    );
  }
  if (status === "loading") {
    return <p className="text-sm text-muted">読み込み中…</p>;
  }
  if (status === "error") {
    return <p className="text-sm text-muted">ラベルを読み込めませんでした</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <LabelStatsHeader
        total={stats.total}
        used={stats.used}
        unused={stats.unused}
        isExportDisabled={isPending || isExporting}
        onExport={() => {
          void handleExport();
        }}
      />
      <CreateLabelForm
        values={form}
        editingName={editingName}
        isPending={isPending}
        groupOptions={groupCounts.groups.map((g) => g.group)}
        onChange={setField}
        onReset={resetForm}
        onSubmit={() => {
          void handleSubmit();
        }}
      />
      <LabelFilterBar
        totalCount={groupCounts.all}
        groupOptions={groupCounts.groups}
        groupFilter={groupFilter}
        keyword={keyword}
        sort={sort}
        onGroupChange={setGroupFilter}
        onKeywordChange={setKeyword}
        onSortChange={setSort}
      />
      <LabelTable
        labels={sorted}
        usageCounts={usageCounts}
        isPending={isPending}
        now={now}
        onUsageClick={onLabelUsageClick}
        onEdit={startEdit}
        onDelete={(name) => {
          void handleDelete(name);
        }}
      />
      <LabelFooterTally
        shown={sorted.length}
        total={labels.length}
        colorTally={colorTally}
      />
    </div>
  );
};
