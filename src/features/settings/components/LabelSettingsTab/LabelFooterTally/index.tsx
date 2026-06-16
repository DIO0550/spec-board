import { LabelRegistry } from "@/domains/label-registry";

type LabelFooterTallyProps = {
  /** 表示中件数（フィルタ後） */
  shown: number;
  /** 総数 */
  total: number;
  /** 使用中ラベルの色集計（color or group キー） */
  colorTally: readonly { color: string; count: number }[];
};

/**
 * 色キーから表示用の背景色を解決する。
 * `#` から始まれば直接、そうでなければ LabelRegistry のグループトークン bg を使う。
 * @param key - color or group キー
 * @returns 背景色（CSS 色）
 */
const swatchBg = (key: string): string => {
  if (key.startsWith("#")) {
    return key;
  }
  return LabelRegistry.tokensForGroup(key).bg;
};

/**
 * 「N / N 件 表示中」+ 使用中ラベルのカラー集計をフッターとして表示する。
 * @param props - {@link LabelFooterTallyProps}
 * @returns フッター要素
 */
export const LabelFooterTally = ({
  shown,
  total,
  colorTally,
}: LabelFooterTallyProps) => {
  return (
    <div className="flex items-center justify-between text-xs text-muted">
      <span>
        {shown} / {total} 件 表示中
      </span>
      <div className="flex items-center gap-2">
        <span>使用中のカラー</span>
        {colorTally.map((entry) => (
          <span
            key={entry.color}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5"
            title={entry.color}
          >
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full border border-slate-300"
              style={{ backgroundColor: swatchBg(entry.color) }}
            />
            {entry.count}
          </span>
        ))}
      </div>
    </div>
  );
};
