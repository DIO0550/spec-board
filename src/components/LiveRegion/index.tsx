/**
 * SR に通知する 1 件のアナウンスメッセージ。
 *
 * 同じ文字列を連続で setState しても React が再 render を省略して SR が
 * 読み上げないケースを避けるため、id を一意化して受け取り、key として
 * div を再 mount させる。
 */
export type LiveAnnouncement = {
  /** 通知の連番（同じ text でも id が変われば div を再 mount し SR に届ける）。 */
  readonly id: number;
  /** 読み上げる文字列。空文字なら SR トリガなし。 */
  readonly text: string;
};

type LiveRegionProps = {
  /** null のとき何も読み上げない（初期状態）。 */
  announcement: LiveAnnouncement | null;
};

/**
 * 視覚非表示の aria-live="polite" 領域。
 *
 * status 変更などの非緊急アナウンスを SR に通知する目的で使用する。
 * 同一テキストの連続通知でも `announcement.id` を更新することで div の key が
 * 変わり再 mount されるため、SR が再度読み上げる。
 *
 * @param props LiveRegion の props
 * @returns aria-live polite な div 要素
 */
export const LiveRegion = ({ announcement }: LiveRegionProps) => {
  return (
    <div
      key={announcement?.id ?? 0}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="live-region"
      className="sr-only absolute -m-px h-px w-px overflow-hidden border-0 p-0 [clip:rect(0,0,0,0)]"
    >
      {announcement?.text ?? ""}
    </div>
  );
};
