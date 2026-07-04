/**
 * project switch を示す invalid-state エラーの message 文字列。
 * reorder などの後段 effect は、楽観 dispatch を rollback すべきかどうかを
 * この message と照合して判定する（switch 時は reducer が新 project に
 * 切替済みのため rollback してはならない）。
 */
export const PROJECT_SWITCHED_MESSAGE = "プロジェクトが切り替わりました";
