import { isMutationCommand } from "@/lib/tauri/mutationFailureMessage";
import type { ProjectError } from "../errors";

/**
 * この ProjectError が invokeWrapped 層で既にトースト通知済みかを判定する。
 * tauri 由来かつ起点コマンドが書き込み allowlist のときだけ true。
 *
 * App 側はこれが true の失敗だけ自前の showToast を抑止し、二重通知を防ぐ。
 * allowlist 外 tauri（get_tasks / get_columns refresh / open_project 等）や
 * 非 tauri（invalid-state）は false となり、App が従来どおり通知する
 * （サイレント化の防止）。
 *
 * @param err 判定対象の ProjectError
 * @returns invokeWrapped が通知済みなら true（App 側は出さない）
 */
export const wasNotifiedByInvokeWrapped = (err: ProjectError): boolean =>
  err.kind === "tauri" &&
  err.error.command !== undefined &&
  isMutationCommand(err.error.command);
