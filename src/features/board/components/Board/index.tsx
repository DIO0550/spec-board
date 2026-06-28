import type { ReactNode } from "react";
import { AddColumnButton } from "../AddColumnButton";
import { Column } from "../Column";

/** Board の Props（compound 形）。中身は children として呼び出し側が組み立てる。 */
type BoardProps = {
  /** {@link Column}（= `Board.Column`）と {@link AddColumnButton}（= `Board.AddColumn`）を中心にした任意の ReactNode */
  children: ReactNode;
};

/**
 * カラム一覧を横並びで表示するボードコンテナ。
 * sort / `columnDraggable` 判定 / handler bind は呼び出し側責務とし、
 * 本コンポーネントは外側 flex-col + 内側 flex-row を提供する薄いレイアウトだけを担う。
 *
 * @param props - {@link BoardProps}
 * @returns ボード要素
 */
const BoardRoot = ({ children }: BoardProps) => (
  <div className="flex h-full flex-col">
    <div className="flex flex-1 gap-4 overflow-x-auto p-4">{children}</div>
  </div>
);

/** Compound コンポーネント本体（Root + 2 サブ部品の名前空間） */
type BoardComponent = ((props: BoardProps) => ReactNode) & {
  Column: typeof Column;
  AddColumn: typeof AddColumnButton;
};

/**
 * ボード（Compound コンポーネント）。
 * `<Board><Board.Column .../><Board.AddColumn .../></Board>` の形で利用する。
 * `Board.Column` は {@link Column}、`Board.AddColumn` は {@link AddColumnButton} の alias で、
 * 参照同一性を保ったまま名前空間として公開する。
 */
export const Board: BoardComponent = Object.assign(BoardRoot, {
  Column,
  AddColumn: AddColumnButton,
});
