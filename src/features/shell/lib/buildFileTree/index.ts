import type { Task } from "@/types/task";

/** ファイルツリーのノード（ディレクトリ or タスクファイル）。 */
export type FileTreeNode =
  | {
      /** ディレクトリ */
      kind: "dir";
      /** ディレクトリ名（末尾セグメント） */
      name: string;
      /** ルートからのパス（`/` 区切り） */
      path: string;
      /** 子ノード（ディレクトリ優先・名前昇順） */
      children: FileTreeNode[];
    }
  | {
      /** タスクファイル（葉） */
      kind: "file";
      /** ファイル名（末尾セグメント） */
      name: string;
      /** このファイルに対応するタスク */
      task: Task;
    };

/** ツリー構築中のディレクトリ可変ノード。 */
type MutableDir = {
  kind: "dir";
  name: string;
  path: string;
  dirs: Map<string, MutableDir>;
  files: { name: string; task: Task }[];
};

/**
 * 空のディレクトリノードを作る。
 * @param name - ディレクトリ名
 * @param path - ルートからのパス
 * @returns 可変ディレクトリノード
 */
const newDir = (name: string, path: string): MutableDir => ({
  kind: "dir",
  name,
  path,
  dirs: new Map(),
  files: [],
});

/**
 * 可変ディレクトリを確定済み FileTreeNode に変換する（ディレクトリ優先・名前昇順）。
 * @param dir - 変換元の可変ディレクトリ
 * @returns 子ノード配列
 */
const finalizeChildren = (dir: MutableDir): FileTreeNode[] => {
  const dirNodes: FileTreeNode[] = Array.from(dir.dirs.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((child) => ({
      kind: "dir",
      name: child.name,
      path: child.path,
      children: finalizeChildren(child),
    }));
  const fileNodes: FileTreeNode[] = [...dir.files]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((file) => ({ kind: "file", name: file.name, task: file.task }));
  return [...dirNodes, ...fileNodes];
};

/**
 * タスクの filePath からディレクトリ階層のファイルツリーを組み立てる。
 * 各階層はディレクトリを先に、続けてファイルを名前昇順で並べる。
 * @param tasks - ツリー化するタスク一覧
 * @returns ルート直下のノード配列
 */
export const buildFileTree = (tasks: Task[]): FileTreeNode[] => {
  const root = newDir("", "");
  for (const task of tasks) {
    const segments = task.filePath
      .replace(/\\/g, "/")
      .split("/")
      .filter((segment) => segment !== "" && segment !== ".");
    if (segments.length === 0) {
      continue;
    }
    let current = root;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const segment = segments[i];
      const childPath =
        current.path === "" ? segment : `${current.path}/${segment}`;
      const existing = current.dirs.get(segment);
      const dir = existing ?? newDir(segment, childPath);
      if (existing === undefined) {
        current.dirs.set(segment, dir);
      }
      current = dir;
    }
    const fileName = segments[segments.length - 1];
    current.files.push({ name: fileName, task });
  }
  return finalizeChildren(root);
};
