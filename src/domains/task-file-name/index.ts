declare const taskFileNameBrand: unique symbol;

/**
 * タスクタイトルから生成された kebab-case ファイル名 base 文字列。
 * `TaskFileName.from` 経由でのみ生成される branded string。
 */
export type TaskFileName = string & { readonly [taskFileNameBrand]: true };

/** TaskFileName の companion API。 */
export const TaskFileName = {
  /**
   * 任意の文字列を kebab-case のファイル名 base 文字列に変換する。
   * BE 側 `to_kebab_case` と挙動を一致させる。
   *  - 入力に ASCII が 1 文字も含まれなければ入力そのままを返す（日本語のみは保持）
   *  - ASCII を含む場合: 英大文字 → 小文字、英数字以外の ASCII は区切り、非 ASCII はそのまま
   *  - 区切りの連続は 1 個に集約、先頭末尾の `-` を除去
   *  - 空入力 / 記号のみの入力は空文字を返す（フォールバック名なし）
   *
   * @param raw 任意の入力文字列
   * @returns kebab-case 化した branded 文字列
   */
  from: (raw: string): TaskFileName => {
    const hasAscii = [...raw].some((c) => c.charCodeAt(0) < 128);
    if (!hasAscii) {
      return raw as TaskFileName;
    }
    let out = "";
    let lastWasSeparator = true;
    for (const ch of raw) {
      const code = ch.charCodeAt(0);
      if (code >= 128) {
        out += ch;
        lastWasSeparator = false;
        continue;
      }
      const isDigit = code >= 0x30 && code <= 0x39;
      const isLower = code >= 0x61 && code <= 0x7a;
      const isUpper = code >= 0x41 && code <= 0x5a;
      if (isDigit || isLower) {
        out += ch;
        lastWasSeparator = false;
        continue;
      }
      if (isUpper) {
        out += String.fromCharCode(code + 32);
        lastWasSeparator = false;
        continue;
      }
      if (lastWasSeparator) {
        continue;
      }
      out += "-";
      lastWasSeparator = true;
    }
    if (out.endsWith("-")) {
      out = out.slice(0, -1);
    }
    return out as TaskFileName;
  },
} as const;
