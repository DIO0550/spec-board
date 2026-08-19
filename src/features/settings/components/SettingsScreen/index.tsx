import { type ReactNode, useMemo, useState } from "react";
import type { MilestoneProjectionMap } from "@/domains/milestone-projection";
import type { LabelsResource } from "@/hooks/useLabels";
import type { MilestonesResource } from "@/hooks/useMilestones";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";
import type { UseConfigFilesResult } from "../../hooks/useConfigFiles";
import type { UseMilestoneMutationsResult } from "../../hooks/useMilestoneMutations";
import { type NonEmptySettingsTabs, SettingsTab } from "../../types";
import { AppearanceSettingsTab } from "../AppearanceSettingsTab";
import { ArchiveSettingsTab } from "../ArchiveSettingsTab";
import { ConfigFileTab } from "../ConfigFileTab";
import { LabelSettingsTab } from "../LabelSettingsTab";
import { MilestoneSettingsTab } from "../MilestoneSettingsTab";
import {
  type StatusColumn,
  StatusSettingsTab,
  type StatusSettingsValue,
} from "../StatusSettingsTab";
import { SubNav, subNavPanelId, subNavTabId } from "../SubNav";
import { TrashSettingsTab } from "../TrashSettingsTab";

/** 設定画面に登録するタブ一覧。 */
const SETTINGS_TABS: NonEmptySettingsTabs = [
  { id: "labels", label: "ラベル" },
  { id: "milestones", label: "マイルストーン" },
  { id: "statuses", label: "ステータス" },
  { id: "archive", label: "アーカイブ" },
  { id: "trash", label: "ゴミ箱" },
  { id: "config", label: "設定ファイル" },
  { id: "appearance", label: "外観" },
];

type ActivePanelProps = {
  /** アクティブタブの識別子 */
  tabId: string;
  /** ラベルリソース（labels タブへ配る） */
  labels: LabelsResource;
  /** マイルストーンリソース（milestones タブへ配る） */
  milestones: MilestonesResource;
  /** live milestone usage projection（milestones タブへ配る） */
  milestoneProjections: MilestoneProjectionMap;
  /** App が hoist 保持するマイルストーン CRUD ハンドル（milestones タブへ配る） */
  milestoneMutations: UseMilestoneMutationsResult;
  /**
   * ラベル設定タブから board へ遷移して指定ラベルでフィルタを掛けるコールバック。
   * @param labelName - クリックされたラベル名
   */
  onLabelUsageClick: (labelName: string) => void;
  statusColumns?: readonly StatusColumn[];
  doneColumn?: string;
  onStatusSave?: (
    value: StatusSettingsValue,
    // biome-ignore lint/suspicious/noConfusingVoidType: synchronous callbacks may intentionally return void.
  ) => boolean | void | Promise<boolean | undefined>;
  onOpenBoard?: () => void;
  onOpenConfig?: () => void;
  initialConfigFile?: "config" | "guide";
  configFiles?: UseConfigFilesResult;
};

/**
 * アクティブタブ ID に対応するパネルを描画するコンポーネント。
 * id → コンポーネントの対応付けは view 層の責務として本コンポーネント（switch）に
 * 閉じ込め、タブのデータ型（SettingsTab）には持たせない。未知 id は描画しない。
 * @param props - tabId とリソースを含む props
 * @returns 対応するパネル要素、未知 id なら null
 */
const ActivePanel = ({
  tabId,
  labels,
  milestones,
  milestoneProjections,
  milestoneMutations,
  onLabelUsageClick,
  statusColumns,
  doneColumn,
  onStatusSave,
  onOpenBoard,
  onOpenConfig,
  initialConfigFile,
  configFiles,
}: ActivePanelProps): ReactNode => {
  switch (tabId) {
    case "labels":
      return (
        <LabelSettingsTab
          resource={labels}
          onLabelUsageClick={onLabelUsageClick}
          onOpenSource={
            configFiles === undefined
              ? undefined
              : () => void configFiles.openExternal("labels")
          }
        />
      );
    case "milestones":
      return (
        <MilestoneSettingsTab
          resource={milestones}
          milestoneProjections={milestoneProjections}
          mutations={milestoneMutations}
        />
      );
    case "appearance":
      return <AppearanceSettingsTab />;
    case "archive":
      return <ArchiveSettingsTab />;
    case "trash":
      return <TrashSettingsTab />;
    case "statuses":
      return (
        <StatusSettingsTab
          initialColumns={statusColumns}
          initialDoneColumn={doneColumn}
          onSave={onStatusSave}
          onOpenBoard={onOpenBoard}
          onOpenConfig={onOpenConfig}
        />
      );
    case "config":
      if (configFiles === undefined) {
        return <ConfigFileTab initialFile={initialConfigFile} />;
      }
      return (
        <ConfigFileTab
          files={configFiles.files}
          initialFile={initialConfigFile}
          status={configFiles.status}
          error={configFiles.error}
          isRegenerating={configFiles.isRegenerating}
          toast={configFiles.toast}
          onCopy={(id) => void configFiles.copy(id)}
          onRegenerate={() => void configFiles.regenerate()}
          onOpenExternal={(id) => void configFiles.openExternal(id)}
          onRevealFolder={() => void configFiles.revealFolder()}
        />
      );
    default:
      return null;
  }
};

type SettingsScreenProps = {
  /**
   * ラベルリソース。App が唯一の取得点（useLabels）として保持し、settings 用に
   * live `usageCounts` 上書きを掛けたものを受け取る。
   */
  labels: LabelsResource;
  /**
   * マイルストーンリソース。App が唯一の取得点（useMilestones）として保持するものを
   * 受け取り、board / milestoneView と共有する。設定タブでの CRUD 後の reload が
   * 同一リソースに効くため、バッジ / フィルタ / 専用ビューが即時に最新化される。
   */
  milestones: MilestonesResource;
  /** ProjectData が保持する live milestone projection map。 */
  milestoneProjections: MilestoneProjectionMap;
  /**
   * マイルストーン CRUD ハンドル。App で hoist 保持し、本タブとマイルストーンビュー
   * （MilestoneCreateModal）で同一インスタンスを共有することで、画面遷移を跨いだ
   * 並行書き込みを単一の in-flight ガードで直列化する。
   */
  milestoneMutations: UseMilestoneMutationsResult;
  /**
   * 使用数クリックで board へ遷移しそのラベルで絞り込むコールバック。
   * @param labelName - クリックされたラベル名
   */
  onLabelUsageClick: (labelName: string) => void;
  /** 初期表示タブ。Story/外部ルーティングから直接到達するために使う。 */
  initialTabId?: string;
  /** 戻るaction。App未接続時はno-op。 */
  onBack?: () => void;
  /** マイルストーン選択時に専用ビューへ遷移するコールバック。 */
  onSettingsTab?: (tabId: string) => void;
  projectName?: string;
  projectPath?: string;
  tasks?: readonly Task[];
  columns?: readonly Column[];
  doneColumn?: string;
  onStatusSave?: (
    value: StatusSettingsValue,
    // biome-ignore lint/suspicious/noConfusingVoidType: synchronous callbacks may intentionally return void.
  ) => boolean | void | Promise<boolean | undefined>;
  /** 設定ファイルtabで最初に選択するfile。 */
  initialConfigFile?: "config" | "guide";
  /** Appで生成した実config file resource。 */
  configFiles?: UseConfigFilesResult;
};

/**
 * 設定画面本体。SubNav + アクティブタブのパネルを合成する。
 * board state には依存しない（App 側で保持・据え置き）。ラベル / マイルストーンリソースは
 * App から共有で受け取る（独自取得はしない）。
 * @param props - {@link SettingsScreenProps}
 * @returns 設定画面要素
 */
export const SettingsScreen = ({
  labels,
  milestones,
  milestoneProjections,
  milestoneMutations,
  onLabelUsageClick,
  initialTabId = SETTINGS_TABS[0].id,
  onBack,
  projectName,
  tasks = [],
  columns,
  doneColumn,
  onStatusSave,
  initialConfigFile,
  configFiles: configFilesProp,
  onSettingsTab,
}: SettingsScreenProps) => {
  const [activeTabId, setActiveTabId] = useState<string>(initialTabId);
  const tabs = useMemo<NonEmptySettingsTabs>(
    () => [
      { ...SETTINGS_TABS[0], count: labels.labels.length },
      { ...SETTINGS_TABS[1], count: milestones.milestones.length },
      { ...SETTINGS_TABS[2], count: columns?.length ?? 0 },
      SETTINGS_TABS[3],
      SETTINGS_TABS[4],
      SETTINGS_TABS[5],
      SETTINGS_TABS[6],
    ],
    [labels.labels.length, milestones.milestones.length, columns?.length],
  );
  const activeTab = SettingsTab.selectActive(tabs, activeTabId);
  const statusColumns = useMemo<readonly StatusColumn[] | undefined>(
    () =>
      columns === undefined
        ? undefined
        : [...columns]
            .sort((left, right) => left.order - right.order)
            .map((column, index) => ({
              id: `status-${index}-${column.name}`,
              sourceName: column.name,
              name: column.name,
              taskCount: tasks.filter((task) => task.status === column.name)
                .length,
              color: column.color ?? "oklch(0.62 0.12 235)",
              wipLimit: column.wipLimit,
            })),
    [columns, tasks],
  );

  return (
    <div className="spec-settings-screen grid h-full min-h-0 flex-1 grid-rows-[44px_minmax(0,1fr)] overflow-hidden bg-background">
      <SubNav
        tabs={tabs}
        activeTabId={activeTab.id}
        onSelect={(tabId) => {
          if (tabId === "milestones" && onSettingsTab !== undefined) {
            onSettingsTab(tabId);
            return;
          }
          setActiveTabId(tabId);
        }}
        onBack={onBack}
        projectName={projectName}
      />
      <div
        role="tabpanel"
        id={subNavPanelId(activeTab.id)}
        aria-labelledby={subNavTabId(activeTab.id)}
        className="spec-settings-panel min-h-0 overflow-auto px-8 py-6 pb-14"
      >
        <ActivePanel
          tabId={activeTab.id}
          labels={labels}
          milestones={milestones}
          milestoneProjections={milestoneProjections}
          milestoneMutations={milestoneMutations}
          onLabelUsageClick={onLabelUsageClick}
          statusColumns={statusColumns}
          doneColumn={doneColumn}
          onStatusSave={onStatusSave}
          onOpenBoard={onBack}
          onOpenConfig={() => setActiveTabId("config")}
          initialConfigFile={initialConfigFile}
          configFiles={configFilesProp}
        />
      </div>
    </div>
  );
};
