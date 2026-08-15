import { useId, useState } from "react";
import { LabelColor } from "@/domains/label-color";
import {
  LabelDraft,
  type LabelDraft as LabelDraftType,
  type LabelDraftValidation,
  type LabelName,
} from "@/domains/label-definition";
import { LABEL_COLOR_PRESETS } from "@/features/settings/lib/labelSettings/colorPresets";
import { resolveLabelSwatchStyle } from "@/features/settings/lib/labelSettings/swatch";

const DEFAULT_PICKER_COLOR = "#7860b5";

/**
 * `<input type="color">` 用に妥当な #RRGGBB のみ反映し、それ以外は既定色へ落とす。
 * @param raw - フォーム保持中の color 文字列
 * @returns 妥当な HEX ならそのまま、それ以外は既定色
 */
const toPickerValue = (raw: string): string =>
  LabelColor.isValid(raw) ? raw : DEFAULT_PICKER_COLOR;

type CreateLabelFormProps = {
  /** フォーム入力値（raw 保持の下書き） */
  values: LabelDraftType;
  /** 編集中の対象 name（persisted identity）。`null` は新規作成モード。 */
  editingName: LabelName | null;
  /** mutation 実行中 */
  isPending: boolean;
  /** domain validation の結果 */
  validation: LabelDraftValidation;
  /** 既存のグループ一覧（プルダウンに並べる候補） */
  groupOptions: readonly string[];
  /**
   * フィールド更新ハンドラ。
   * @param key - 更新するフィールド名
   * @param value - 新しい値
   */
  onChange: (key: keyof LabelDraftType, value: string) => void;
  /** クリア（新規モードに戻す） */
  onReset: () => void;
  /** 送信（成功時に親が resetForm を呼ぶ） */
  onSubmit: () => void;
};

/**
 * ラベル作成 / 編集フォーム。名前 / 説明 / グループ / カラー（HEX textbox + color picker +
 * プリセット 10 色）/ ライブプレビュー / クリア・作成（編集時は更新 + キャンセル）。
 * @param props - {@link CreateLabelFormProps}
 * @returns フォーム要素
 */
export const CreateLabelForm = ({
  values,
  editingName,
  isPending,
  validation,
  groupOptions,
  onChange,
  onReset,
  onSubmit,
}: CreateLabelFormProps) => {
  const nameId = useId();
  const descId = useId();
  const groupId = useId();
  const hexId = useId();
  const pickerId = useId();
  const nameErrorId = useId();
  const isEditing = editingName !== null;
  const preview = LabelDraft.preview(values);
  const previewLabel = preview.name;
  const effectiveColor = LabelColor.effective(values.color);
  const pickerColor = toPickerValue(effectiveColor ?? "");
  const [isGroupOpen, setIsGroupOpen] = useState(false);

  const isEmpty =
    values.name === "" &&
    values.description === "" &&
    values.group === "" &&
    values.color === "";

  const hasErrors = validation.errors.length > 0;
  const nameError = validation.errors.find(
    (e) => e.code === "name-required" || e.code === "name-duplicate",
  );
  const showMessages = !isEmpty;

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-accent-border bg-surface px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <span aria-hidden="true">+</span>
        {isEditing ? `「${editingName}」を編集` : "新しいラベル"}
      </div>
      <fieldset disabled={isPending} className="contents">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_200px_180px]">
          <div className="flex flex-col gap-1">
            <label htmlFor={nameId} className="text-xs text-muted">
              名前
            </label>
            <input
              id={nameId}
              value={values.name}
              disabled={isEditing}
              onChange={(e) => onChange("name", e.target.value)}
              className="rounded border border-border px-2 py-1 text-sm disabled:bg-surface-muted"
              placeholder="needs-design"
              aria-invalid={showMessages && nameError !== undefined}
              aria-describedby={
                showMessages && nameError !== undefined
                  ? nameErrorId
                  : undefined
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={descId} className="text-xs text-muted">
              説明（任意）
            </label>
            <input
              id={descId}
              value={values.description}
              onChange={(e) => onChange("description", e.target.value)}
              className="rounded border border-border px-2 py-1 text-sm"
              placeholder="デザイン待ちのタスク"
            />
          </div>
          <div className="relative flex flex-col gap-1">
            <label htmlFor={groupId} className="text-xs text-muted">
              グループ
            </label>
            <div className="relative">
              <input
                id={groupId}
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={isGroupOpen}
                aria-controls={`-listbox`}
                value={values.group}
                onFocus={() => setIsGroupOpen(true)}
                onChange={(event) => {
                  onChange("group", event.target.value);
                  setIsGroupOpen(true);
                }}
                className="w-full rounded border border-border bg-surface-muted px-2 py-1 pr-8 text-sm text-foreground"
                placeholder="status"
              />
              <button
                type="button"
                aria-label="グループ候補を開く"
                onClick={() => setIsGroupOpen((open) => !open)}
                className="absolute inset-y-0 right-0 px-2 text-text-dim"
              >
                ⌄
              </button>
            </div>
            {isGroupOpen ? (
              <div
                id={`-listbox`}
                role="listbox"
                className="absolute top-full left-0 z-20 mt-1 w-[232px] rounded-[10px] border border-border-strong bg-surface p-1.5 shadow-lg"
              >
                {groupOptions.map((group) => (
                  <button
                    key={group}
                    type="button"
                    role="option"
                    aria-selected={values.group === group}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onChange("group", group);
                      setIsGroupOpen(false);
                    }}
                    className="flex h-7 w-full items-center rounded-md px-2 text-left text-xs text-foreground hover:bg-surface-muted aria-selected:bg-accent-soft"
                  >
                    {group}
                  </button>
                ))}
                <p className="border-t border-border px-2 pt-1.5 text-[10.5px] text-muted">
                  入力して新しいグループを作成
                </p>
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">プレビュー</span>
            <span
              className="inline-flex items-center gap-1 self-start rounded-full border px-2 py-0.5 text-xs"
              style={resolveLabelSwatchStyle(preview)}
              data-testid="label-form-preview"
            >
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full bg-current"
              />
              {previewLabel}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={hexId} className="text-xs text-muted">
            カラー{" "}
            <span className="text-muted">
              — HEX を直接入力、またはプリセットから選択
            </span>
          </label>
          <div className="flex items-center gap-2">
            <span className="relative inline-block h-8 w-8 shrink-0 overflow-hidden rounded-md border border-border shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]">
              <span
                aria-hidden="true"
                className="absolute inset-0"
                style={{ backgroundColor: pickerColor }}
              />
              <input
                id={pickerId}
                type="color"
                value={pickerColor}
                onChange={(e) => onChange("color", e.target.value)}
                className="absolute -inset-1 h-[calc(100%+8px)] w-[calc(100%+8px)] cursor-pointer opacity-0"
                aria-label="カラーピッカー"
              />
            </span>
            <span className="inline-flex h-8 items-center rounded border border-border bg-surface pl-2 pr-2.5">
              <span
                aria-hidden="true"
                className="mr-px font-mono text-sm text-muted"
              >
                #
              </span>
              <input
                id={hexId}
                value={values.color.replace(/^#/, "")}
                onChange={(e) => {
                  const body = e.target.value.replace(/^#/, "");
                  onChange("color", body === "" ? "" : `#${body}`);
                }}
                maxLength={7}
                spellCheck={false}
                autoComplete="off"
                className="w-[78px] border-none bg-transparent p-0 font-mono text-sm tracking-wide outline-none"
                placeholder="7860b5"
              />
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-[11px] text-muted">プリセット</span>
            {LABEL_COLOR_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                title={preset.name}
                aria-label={`プリセット ${preset.name}`}
                onClick={() => onChange("color", preset.hex)}
                className="h-[18px] w-[18px] shrink-0 rounded border-2 border-transparent shadow-[inset_0_0_0_1px_rgba(20,24,32,0.08)] transition-transform hover:scale-110"
                style={{ backgroundColor: preset.hex }}
              />
            ))}
          </div>
        </div>
        {showMessages && (
          <>
            {validation.errors.length > 0 && (
              <div
                id={nameErrorId}
                role="alert"
                className="text-xs text-red-600"
              >
                {nameError?.code === "name-required" &&
                  "名前を入力してください"}
                {nameError?.code === "name-duplicate" &&
                  `同名のラベル「${nameError.existing}」が既に存在します`}
              </div>
            )}
            {validation.warnings.length > 0 && (
              <div
                role="status"
                aria-live="polite"
                className="text-xs text-amber-600"
              >
                {validation.warnings.map((w) => (
                  <p key={w.code}>
                    {w.code === "name-outer-whitespace" &&
                      "名前の前後に空白が含まれています。そのまま保存されます"}
                    {w.code === "name-similar" &&
                      `類似した名前「${w.existing}」が存在します`}
                    {w.code === "color-invalid" &&
                      "カラーは #RRGGBB 形式でない場合、既定色になります"}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </fieldset>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          名前は kebab-case 推奨、 type:bug のようにグループ接頭辞も使えます
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReset}
            disabled={isPending}
            className="rounded border border-border px-3 py-1 text-sm"
          >
            {isEditing ? "キャンセル" : "クリア"}
          </button>
          <button
            type="submit"
            disabled={hasErrors || isPending}
            className="rounded bg-accent px-3 py-1 text-sm text-accent-foreground disabled:opacity-50"
          >
            {isEditing ? "更新" : "ラベルを作成"}
          </button>
        </div>
      </div>
    </form>
  );
};
