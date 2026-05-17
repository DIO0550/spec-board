/**
 * SR に通知する 1 件のアナウンスメッセージ。
 *
 * 同じ文字列を連続で setState しても、live region の textContent が
 * 同値なら DOM ミューテーションが起きず SR が再読しないケースがある。
 * id を一意化して受け取り、id の偶奇でゼロ幅スペースを付け替えることで、
 * 同一文言の連続通知でも textContent を必ず変化させて SR をトリガする。
 */
export type LiveAnnouncement = {
  /** 通知の連番（同じ text でも id が変われば textContent が変わり SR に届く）。 */
  readonly id: number;
  /** 読み上げる文字列。空文字なら SR トリガなし。 */
  readonly text: string;
};

type LiveRegionProps = {
  /** null のとき何も読み上げない（初期状態）。 */
  announcement: LiveAnnouncement | null;
};

/** ゼロ幅スペース。SR にトリガをかけるための不可視差分文字。 */
const ZERO_WIDTH_SPACE = "​";

/**
 * announcement から render する textContent を組み立てる。
 *
 * live region は安定した DOM ノードに保ち、textContent のミューテーションで
 * SR を駆動するのがアクセシビリティのベストプラクティス。一方で同一文言の
 * 連続通知も SR に届ける必要があるため、id の偶奇で末尾にゼロ幅スペースを
 * 付け替え、テキストが必ず変化するようにする。
 *
 * @param announcement 現在のアナウンス
 * @returns div の textContent として描画する文字列
 */
const renderText = (announcement: LiveAnnouncement | null): string => {
  if (announcement === null) {
    return "";
  }
  const suffix = announcement.id % 2 === 0 ? "" : ZERO_WIDTH_SPACE;
  return `${announcement.text}${suffix}`;
};

/**
 * 視覚非表示の aria-live="polite" 領域。
 *
 * status 変更などの非緊急アナウンスを SR に通知する目的で使用する。
 * div 自体はマウント以後一度も unmount されず、textContent のみが更新される。
 * 同一文言の連続通知は {@link renderText} がゼロ幅スペースを付け替えることで
 * SR に再読をトリガする。
 *
 * @param props LiveRegion の props
 * @returns aria-live polite な div 要素
 */
export const LiveRegion = ({ announcement }: LiveRegionProps) => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="live-region"
      className="sr-only absolute -m-px h-px w-px overflow-hidden border-0 p-0 [clip:rect(0,0,0,0)]"
    >
      {renderText(announcement)}
    </div>
  );
};
