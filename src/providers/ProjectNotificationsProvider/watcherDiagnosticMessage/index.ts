import type { WatcherDiagnosticCode } from "@/domains/watcher-diagnostic";

const MESSAGES: Record<WatcherDiagnosticCode, string> = {
  watchPathUnavailable:
    "監視対象のフォルダにアクセスできなくなりました。変更が自動反映されない可能性があります",
  resourceExhausted:
    "OS のファイル監視上限に達しました。変更が自動反映されない可能性があります",
  permissionDenied:
    "権限が不足しているためファイル監視を継続できません。変更が自動反映されない可能性があります",
  io: "ファイル監視で入出力エラーが発生しました。変更が自動反映されない可能性があります",
  rescanFailed:
    "ファイルの再読み込みに失敗しました。プロジェクトを開き直すと復旧します",
  unknown:
    "ファイル監視で問題が発生しました。変更が自動反映されない可能性があります",
};

/**
 * watcher diagnostics の code をユーザー向け文言に変換する。
 *
 * 未知の code は汎用文言にフォールバックする（BE が code を増やしても通知自体は
 * 必ず出す）。監視が壊れても board は静かに古くなるだけで利用者には見えないため、
 * 「何も出ない」より「粗い文言でも出る」を優先する。
 * @param code BE から届いた診断コード
 * @returns toast に表示する日本語メッセージ
 */
export const watcherDiagnosticMessage = (code: WatcherDiagnosticCode): string =>
  MESSAGES[code] ?? MESSAGES.unknown;
