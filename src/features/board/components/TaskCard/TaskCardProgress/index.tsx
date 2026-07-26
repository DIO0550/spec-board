import { SubIssueProgress } from "../../SubIssueProgress";
import { useTaskCardContext } from "../TaskCardContext";

/**
 * TaskCard の進捗バー行。集計値も子行も Root が context に載せた値をそのまま流す
 * 純粋な表示部品。FE 側の再集計・override 経路は持たない（真実源を 1 つに保つ）。
 * @returns 進捗バー行
 */
export const TaskCardProgress = () => {
  const ctx = useTaskCardContext();

  return (
    <SubIssueProgress childRows={ctx.childRows} counts={ctx.subIssueCounts} />
  );
};
