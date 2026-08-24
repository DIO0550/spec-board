import type { Task, TaskFilePath } from "@/types/task";

/**
 * `planAddLink` / `planRemoveLink` 共通の入力。lookup は action 側の責務。
 * - add: `targetFilePath` は canonical（`buildAddLinkCandidates` 由来の `Task.filePath`）。
 *   source / target とも完全一致 lookup で引き当てた Task を渡す
 * - remove: `targetFilePath` は frontmatter 由来の raw 値（`./tasks/b.md` 等）のまま渡す。
 *   target には参照解決 lookup（`linkReferencesTaskPath` で表記揺れ吸収）で解決した
 *   Task を渡す（解決不能 = broken link なら undefined）。plan はこの対応関係を再検証しない
 */
export type LinkIntent = {
  /** リンク元タスクの filePath */
  readonly sourceFilePath: TaskFilePath;
  /** リンク先の filePath（add は canonical / remove は raw 値） */
  readonly targetFilePath: string;
  /** state から引き当てた source Task（不在なら undefined） */
  readonly source: Task | undefined;
  /** state から引き当てた target Task（不在なら undefined） */
  readonly target: Task | undefined;
};

/** filePath / 参照から Task を引き当てる lookup（state への依存は呼出側が閉じる）。 */
export type LinkTaskLookup = (filePath: TaskFilePath) => Task | undefined;

/** raw frontmatter参照からTaskを解決するlookup。 */
type LinkReferenceLookup = (reference: string) => Task | undefined;

/** `LinkIntent.forAdd` の引数。 */
export type AddLinkIntentArgs = {
  /** リンク元タスクの filePath */
  readonly sourceFilePath: TaskFilePath;
  /** リンク先タスクの canonical filePath（`buildAddLinkCandidates` 由来） */
  readonly targetFilePath: TaskFilePath;
  /** canonical 完全一致 lookup */
  readonly findTask: LinkTaskLookup;
};

/** `LinkIntent.forRemove` の引数。 */
export type RemoveLinkIntentArgs = {
  /** リンク元タスクの filePath */
  readonly sourceFilePath: TaskFilePath;
  /** 削除するリンクの raw 値（`linkedFilePaths` の要素。表記揺れ可） */
  readonly targetFilePath: string;
  /** canonical 完全一致 lookup（source の引き当て用） */
  readonly findTask: LinkTaskLookup;
  /** raw 参照の解決 lookup（target の引き当て用。解決不能なら undefined を返す） */
  readonly findTaskByReference: LinkReferenceLookup;
};

/**
 * `LinkIntent` の companion API。plan 入力の構築時に使う lookup の使い分け契約
 * （add = source / target とも canonical 完全一致、remove = source は canonical・
 * target は raw 参照の正規化同値解決）をドメイン側に固定する。
 */
export const LinkIntent = {
  /**
   * add 用の intent を構築する。source / target とも canonical 完全一致 lookup で
   * 引き当てる（targetFilePath は候補 UI 由来の `Task.filePath` 前提）。
   *
   * @param args filePath ペアと lookup
   * @returns planAddLink へ渡す intent
   */
  forAdd: (args: AddLinkIntentArgs): LinkIntent => ({
    sourceFilePath: args.sourceFilePath,
    targetFilePath: args.targetFilePath,
    source: args.findTask(args.sourceFilePath),
    target: args.findTask(args.targetFilePath),
  }),
  /**
   * remove 用の intent を構築する。source は canonical 完全一致、target は
   * raw 参照（表記揺れ）の解決 lookup で引き当てる（解決不能 = broken link なら
   * target は undefined のまま plan が forward のみの apply を返す）。
   *
   * @param args filePath ペアと lookup 2 種
   * @returns planRemoveLink へ渡す intent
   */
  forRemove: (args: RemoveLinkIntentArgs): LinkIntent => ({
    sourceFilePath: args.sourceFilePath,
    targetFilePath: args.targetFilePath,
    source: args.findTask(args.sourceFilePath),
    target: args.findTaskByReference(args.targetFilePath),
  }),
} as const;
