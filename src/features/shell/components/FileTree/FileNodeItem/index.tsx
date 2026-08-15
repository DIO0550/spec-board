import { memo, useState } from "react";
import type { FileTreeNode } from "@/features/shell/lib/buildFileTree";

/**
 * 1 段あたりのインデント幅（px）。
 * ファイルツリーは深い階層になりやすく横幅が限られるため、TreeView（16px）より
 * 狭い 12px に抑えて深いネストでも横スクロールしにくくする。
 */
const INDENT_PER_DEPTH = 12;

type FileNodeItemProps = {
  /** 描画するノード */
  node: FileTreeNode;
  /** ルートからの深さ */
  depth: number;
  /** 現在選択中のタスク ID（ハイライト用） */
  selectedTaskId?: string | null;
  /**
   * ファイル（タスク）選択ハンドラ（安定参照で渡す）。
   * @param taskId - 選択されたタスクの ID
   */
  onSelect: (taskId: string) => void;
};

type FileIconKind = "markdown" | "json" | "config";

type StatusMark = {
  kind: "progress" | "done";
  symbol: "●" | "✓";
  label: string;
};

/**
 * ファイル名からExplorerで使うアイコン種別を決める。
 * @param name - ファイル名
 * @returns アイコン種別
 */
const getFileIconKind = (name: string): FileIconKind => {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "json") {
    return "json";
  }
  if (extension === "md") {
    return "markdown";
  }
  return "config";
};

/**
 * 参照HTMLと同じく、進行中と完了だけを右端のマークで示す。
 * @param status - タスクのステータス
 * @returns 表示する状態マーク。対象外ならnull
 */
const getStatusMark = (status: string): StatusMark | null => {
  const normalized = status.trim().toLowerCase();
  if (
    ["done", "completed", "complete", "finished", "完了"].includes(normalized)
  ) {
    return { kind: "done", symbol: "✓", label: "完了" };
  }
  if (["in progress", "in-progress", "doing", "進行中"].includes(normalized)) {
    return { kind: "progress", symbol: "●", label: "進行中" };
  }
  return null;
};

const ChevronIcon = () => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="spec-file-tree-twisty-icon"
  >
    <path d="M9 6l6 6-6 6" />
  </svg>
);

const FolderIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h3.8l2 2h9.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
  </svg>
);

const MarkdownIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="1.5" />
    <path d="M6 14V9l2.5 3L11 9v5M14 9v5M14 13l2 2 2-2" />
  </svg>
);

const JsonIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 4c-2 0-3 1-3 3v3c0 1-1 2-2 2 1 0 2 1 2 2v3c0 2 1 3 3 3M16 4c2 0 3 1 3 3v3c0 1 1 2 2 2-1 0-2 1-2 2v3c0 2-1 3-3 3" />
  </svg>
);

const ConfigIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6" />
  </svg>
);

type FileIconProps = {
  kind: FileIconKind;
};

const FileIcon = ({ kind }: FileIconProps) => {
  const icon =
    kind === "markdown" ? (
      <MarkdownIcon />
    ) : kind === "json" ? (
      <JsonIcon />
    ) : (
      <ConfigIcon />
    );

  return (
    <span
      aria-hidden="true"
      className={[
        "spec-file-tree-icon",
        ["spec-file-tree-icon-", kind].join(""),
      ].join(" ")}
    >
      {icon}
    </span>
  );
};

/**
 * ファイルツリー 1 ノード（ディレクトリ or ファイル）。ディレクトリの折りたたみ状態を
 * ノード単位のローカル state で持つため、ある階層の開閉が他ノードの再描画を引き起こさない。
 * memo で props 不変時の再描画も避ける。
 * @param props - {@link FileNodeItemProps}
 * @returns ファイルノード要素
 */
export const FileNodeItem = memo(
  ({ node, depth, selectedTaskId, onSelect }: FileNodeItemProps) => {
    // ファイルノードでは未使用だが、Hooks のルール上ノード種別に依らず常に同数呼ぶ。
    const [collapsed, setCollapsed] = useState(false);
    const twistyIndent = {
      marginLeft: [depth * INDENT_PER_DEPTH, "px"].join(""),
    };

    if (node.kind === "file") {
      const isSelected = node.task.id === selectedTaskId;
      const statusMark = getStatusMark(node.task.status);
      const rowClassName = isSelected
        ? "spec-file-tree-row is-active bg-accent-soft"
        : "spec-file-tree-row hover:bg-surface-muted";

      return (
        <li className="spec-file-tree-node">
          <button
            type="button"
            onClick={() => onSelect(node.task.id)}
            className={rowClassName}
          >
            <span
              aria-hidden="true"
              className="spec-file-tree-twisty is-empty"
              style={twistyIndent}
            />
            <FileIcon kind={getFileIconKind(node.name)} />
            <span className="spec-file-tree-name" title={node.task.title}>
              {node.name}
            </span>
            {statusMark !== null && (
              <span
                className={[
                  "spec-file-tree-status",
                  ["spec-file-tree-status-", statusMark.kind].join(""),
                ].join(" ")}
                title={statusMark.label}
              >
                {statusMark.symbol}
              </span>
            )}
          </button>
        </li>
      );
    }

    return (
      <li
        className={[
          "spec-file-tree-node",
          collapsed ? "is-collapsed" : "is-expanded",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-expanded={!collapsed}
          className="spec-file-tree-row spec-file-tree-directory-row hover:bg-surface-muted"
        >
          <span
            aria-hidden="true"
            className={[
              "spec-file-tree-twisty",
              collapsed ? "is-collapsed" : "is-expanded",
              node.children.length === 0 ? "is-empty" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={twistyIndent}
          >
            <ChevronIcon />
          </span>
          <span
            aria-hidden="true"
            className="spec-file-tree-icon spec-file-tree-icon-folder folder"
          >
            <FolderIcon />
          </span>
          <span className="spec-file-tree-name">{node.name}</span>
        </button>
        {!collapsed && (
          <ul className="spec-file-tree-children">
            {node.children.map((child) => (
              <FileNodeItem
                key={
                  child.kind === "dir"
                    ? ["dir:", child.path].join("")
                    : ["file:", child.task.id].join("")
                }
                node={child}
                depth={depth + 1}
                selectedTaskId={selectedTaskId}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </li>
    );
  },
);
