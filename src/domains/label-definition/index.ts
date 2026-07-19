import { LabelColor } from "@/domains/label-color";
import type {
  CreateLabelArgs,
  UpdateLabelArgs,
  WireLabelDefinition,
} from "@/lib/tauri";
import type { Brand } from "@/types/brand";

/** 保存済み identity としてのラベル名（raw・未正規化）。companion 経由でのみ生成される。 */
export type LabelName = Brand<string, "LabelName">;

/**
 * 類似名照合用の正規化済みキー（trim + 小文字化適用済みであることを型で表す）。
 * `LabelName.normalize` 経由でのみ生成される。
 */
export type NormalizedLabelName = Brand<string, "NormalizedLabelName">;

/** LabelName の companion API。 */
export const LabelName = {
  /**
   * 類似名照合専用の正規化キーを生成する。identity には不適用。
   * @param raw - 正規化対象の文字列
   * @returns trim + 小文字化された NormalizedLabelName
   */
  normalize: (raw: string): NormalizedLabelName =>
    raw.trim().toLowerCase() as NormalizedLabelName,
} as const;

/** FE domain のラベルマスタ定義 1 件。 */
export type LabelDefinition = {
  readonly name: LabelName;
  description?: string;
  group?: string;
  color?: string;
  updated?: string;
};

/** create/edit フォームの下書き値。すべて raw の string で保持する。 */
export type LabelDraft = {
  name: string;
  description: string;
  group: string;
  color: string;
};

/** フォームプレビュー表示専用の仮定義。name は Brand なしの素の string。 */
export type LabelPreview = {
  name: string;
  description?: string;
  group?: string;
  color?: string;
};

/** update 送信用 args。identity を LabelName に固定する。 */
export type LabelUpdateArgs = Omit<UpdateLabelArgs, "name"> & {
  readonly name: LabelName;
};

/** 送信をブロックする validation エラー。 */
export type LabelDraftError =
  | { code: "name-required" }
  | { code: "name-duplicate"; existing: LabelName };

/** 送信を許容する警告。 */
export type LabelDraftWarning =
  | { code: "name-outer-whitespace" }
  | { code: "name-similar"; existing: LabelName }
  | { code: "color-invalid" };

/** validation 結果。errors が空のときのみ送信可能。 */
export type LabelDraftValidation = {
  errors: readonly LabelDraftError[];
  warnings: readonly LabelDraftWarning[];
};

/** LabelDefinition の companion API（adapter + 参照系）。 */
export const LabelDefinition = {
  /**
   * wire 型 → domain 変換。LabelName への cast はこの companion に閉じる。
   * @param wire - IPC 由来の wire 型
   * @returns domain 型の LabelDefinition
   */
  fromWire: (wire: WireLabelDefinition): LabelDefinition => ({
    name: wire.name as LabelName,
    description: wire.description,
    group: wire.group,
    color: wire.color,
    updated: wire.updated,
  }),

  /**
   * get_labels payload の一覧を domain 型へ変換する（定義順を保持）。
   * @param wires - wire 型の配列
   * @returns domain 型の配列
   */
  listFromWire: (wires: readonly WireLabelDefinition[]): LabelDefinition[] =>
    wires.map(LabelDefinition.fromWire),

  /**
   * ラベル定義配列を name キーの Map に変換する。
   * @param labels - ラベル定義の配列
   * @returns name → LabelDefinition の Map
   */
  byName: (labels: readonly LabelDefinition[]): Map<string, LabelDefinition> =>
    new Map(labels.map((label) => [label.name, label])),

  /**
   * usageCounts の安全な引き当て。own property のみ返す。
   * ラベル名は任意文字列のため `__proto__` 等で継承プロパティを拾わないよう
   * hasOwnProperty で判定する。
   * @param counts - wire 由来の Record
   * @param name - ラベル名
   * @returns 使用数（own property なければ 0）
   */
  usageOf: (counts: Record<string, number>, name: string): number => {
    const has = Object.prototype.hasOwnProperty;
    return has.call(counts, name) ? (counts[name] as number) : 0;
  },
} as const;

/** LabelDraft の companion API（フォーム変換 + validation + args 生成）。 */
export const LabelDraft = {
  /**
   * 新規作成モードの空 draft。
   * @returns 全フィールド空文字の LabelDraft
   */
  empty: (): LabelDraft => ({
    name: "",
    description: "",
    group: "",
    color: "",
  }),

  /**
   * 編集開始時に定義から draft を作る（raw をそのまま写す）。
   * @param def - 編集対象のラベル定義
   * @returns 定義値を raw 写しした LabelDraft
   */
  fromDefinition: (def: LabelDefinition): LabelDraft => ({
    name: def.name,
    description: def.description ?? "",
    group: def.group ?? "",
    color: def.color ?? "",
  }),

  /**
   * フォームプレビュー用の仮定義。
   * @param draft - 現在のフォーム入力値
   * @returns Brand なしの LabelPreview
   */
  preview: (draft: LabelDraft): LabelPreview => {
    const effective = LabelColor.effective(draft.color);
    return {
      name: draft.name === "" ? "preview" : draft.name,
      description: draft.description === "" ? undefined : draft.description,
      group: draft.group === "" ? undefined : draft.group,
      color:
        effective !== undefined && LabelColor.isValid(effective)
          ? effective
          : undefined,
    };
  },

  /**
   * draft を検証する。
   * @param draft - フォーム入力値
   * @param existing - 既存ラベル定義一覧
   * @param editingName - 編集中の identity（null は新規作成モード）
   * @returns validation 結果
   */
  validate: (
    draft: LabelDraft,
    existing: readonly LabelDefinition[],
    editingName: LabelName | null,
  ): LabelDraftValidation => {
    const errors: LabelDraftError[] = [];
    const warnings: LabelDraftWarning[] = [];

    if (editingName === null) {
      const normalized = LabelName.normalize(draft.name);
      if (normalized === ("" as NormalizedLabelName)) {
        errors.push({ code: "name-required" });
      } else {
        const exactMatch = existing.find((l) => l.name === draft.name);
        if (exactMatch) {
          errors.push({ code: "name-duplicate", existing: exactMatch.name });
        }

        if (draft.name !== draft.name.trim()) {
          warnings.push({ code: "name-outer-whitespace" });
        }

        const similarMatch = existing.find(
          (l) =>
            l.name !== draft.name && LabelName.normalize(l.name) === normalized,
        );
        if (similarMatch) {
          warnings.push({ code: "name-similar", existing: similarMatch.name });
        }
      }
    }

    const effectiveColor = LabelColor.effective(draft.color);
    if (effectiveColor !== undefined && !LabelColor.isValid(effectiveColor)) {
      warnings.push({ code: "color-invalid" });
    }

    return { errors, warnings };
  },

  /**
   * create 用 args。name は raw のまま。任意フィールドは trim 後空なら undefined。
   * @param draft - フォーム入力値
   * @returns wire 送信用の CreateLabelArgs
   */
  toCreateArgs: (draft: LabelDraft): CreateLabelArgs => {
    const trimmedDescription = draft.description.trim();
    const trimmedGroup = draft.group.trim();
    return {
      name: draft.name,
      description: trimmedDescription === "" ? undefined : trimmedDescription,
      group: trimmedGroup === "" ? undefined : trimmedGroup,
      color: LabelColor.effective(draft.color),
    };
  },

  /**
   * update 用 args。identity は引数の LabelName で固定。
   * description/group は raw 保持・"" のみ undefined（PUT クリア維持）。
   * color のみ trim 済み実効値を送る。
   * @param name - 編集対象の persisted identity
   * @param draft - フォーム入力値
   * @returns wire 送信用の LabelUpdateArgs
   */
  toUpdateArgs: (name: LabelName, draft: LabelDraft): LabelUpdateArgs => ({
    name,
    description: draft.description === "" ? undefined : draft.description,
    group: draft.group === "" ? undefined : draft.group,
    color: LabelColor.effective(draft.color),
  }),
} as const;
