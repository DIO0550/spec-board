import { useMemo, useRef, useState } from "react";
import {
  LabelDefinition,
  type LabelDefinition as LabelDefinitionType,
  LabelDraft,
  type LabelDraft as LabelDraftType,
  type LabelName,
} from "@/domains/label-definition";
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
import { exportLabels, saveFileDialog } from "@/lib/tauri";
import { getToastSink } from "@/lib/tauri/toastSink";
import { useLabelMutations } from "../../hooks/useLabelMutations";
import { CreateLabelForm } from "./CreateLabelForm";
import { LabelFilterBar } from "./LabelFilterBar";
import { LabelFooterTally } from "./LabelFooterTally";
import { LabelStatsHeader } from "./LabelStatsHeader";
import { LabelTable } from "./LabelTable";

type LabelSettingsTabProps = {
  /** App / SettingsScreen から配られるラベルリソース（唯一の取得点・live usageCounts 上書き済み） */
  resource: LabelsResource;
  /**
   * 使用数クリックで board へ遷移しラベル絞り込みを適用するためのコールバック。
   * @param labelName - クリックされたラベル名
   */
  onLabelUsageClick: (labelName: string) => void;
  /** labels.ymlを外部表示するコールバック。 */
  onOpenSource?: () => void;
  /** 実リソース由来の最終同期表示。未指定時は同期badgeを表示しない。 */
  sourceSyncLabel?: string;
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
  onOpenSource,
  sourceSyncLabel,
}: LabelSettingsTabProps) => {
  const { labels, usageCounts, status, reload } = resource;
  const { isPending, create, update, remove } = useLabelMutations(reload);
  const [editingName, setEditingName] = useState<LabelName | null>(null);
  const [form, setForm] = useState<LabelDraftType>(LabelDraft.empty());
  // export 専用の in-flight ガード。state は disabled 表示用、ref は連打レース防止用
  // （state 反映前の click でも ref で即時ガードされる）。
  const [isExporting, setIsExporting] = useState(false);
  const isExportingRef = useRef(false);
  const [keyword, setKeyword] = useState("");
  const [groupFilter, setGroupFilter] = useState<LabelGroupFilter>({
    kind: "all",
  });
  const [sort, setSort] = useState<LabelSort>("name");

  const validation = useMemo(
    () => LabelDraft.validate(form, labels, editingName),
    [form, labels, editingName],
  );

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
  const setField = (key: keyof LabelDraftType, value: string): void => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  /** フォームを新規モードへリセットする。 */
  const resetForm = (): void => {
    setEditingName(null);
    setForm(LabelDraft.empty());
  };

  /**
   * 編集モードへ切り替える。
   * @param def - 編集対象のラベル定義
   */
  const startEdit = (def: LabelDefinitionType): void => {
    setEditingName(def.name);
    setForm(LabelDraft.fromDefinition(def));
  };

  /** フォーム送信（新規作成 or 更新）。成功時はフォームをリセットする。 */
  const handleSubmit = async (): Promise<void> => {
    if (validation.errors.length > 0) {
      return;
    }
    if (editingName === null) {
      const created = await create(LabelDraft.toCreateArgs(form));
      if (created) {
        resetForm();
      }
      return;
    }
    const updated = await update(LabelDraft.toUpdateArgs(editingName, form));
    if (updated) {
      resetForm();
    }
  };

  /**
   * 削除確認 → mutation 実行。成功時のみ編集状態をリセットする。
   * @param name - 削除対象 name
   */
  const handleDelete = async (name: LabelName): Promise<void> => {
    const count = LabelDefinition.usageOf(usageCounts, name);
    const message =
      count > 0
        ? `「${name}」は ${count} 件のタスクで使用中です。削除しますか？（タスクの値は残ります）`
        : `「${name}」を削除しますか？`;
    if (!globalThis.confirm(message)) {
      return;
    }
    const removed = await remove(name);
    if (removed && editingName === name) {
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
    <section
      className="mx-auto flex w-full max-w-[1080px] flex-col gap-3.5"
      aria-label="ラベル設定"
    >
      <LabelStatsHeader
        total={stats.total}
        used={stats.used}
        unused={stats.unused}
        isExportDisabled={isPending || isExporting}
        onExport={() => {
          void handleExport();
        }}
      />
      <div className="flex flex-wrap items-center gap-2.5 rounded-md border border-border bg-surface px-3.5 py-2 text-xs text-muted">
        <strong className="font-mono text-[11.5px] text-foreground">
          .spec-board/labels.yml
        </strong>
        <span className="text-border-strong">·</span>
        <span>ラベル定義の保存先</span>
        {sourceSyncLabel !== undefined && (
          <span
            data-testid="label-sync-status"
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-[11px]"
          >
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-success"
            />
            {sourceSyncLabel}
          </span>
        )}
        <button
          type="button"
          onClick={onOpenSource}
          className="text-xs font-medium text-accent hover:underline"
        >
          ファイルを見る
        </button>
      </div>
      <CreateLabelForm
        values={form}
        editingName={editingName}
        isPending={isPending}
        validation={validation}
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
    </section>
  );
};
