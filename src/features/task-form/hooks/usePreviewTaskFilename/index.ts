import { useEffect, useRef, useState } from "react";
import { previewTaskFilename } from "@/lib/tauri";
import type { PreviewTaskFilenamePayload } from "@/lib/tauri/taskCommands/types";

export type UsePreviewTaskFilenameArgs = {
  title: string;
  explicitFilename: string | undefined;
  parentFilePath: string | undefined;
};

/**
 * BE の `preview_task_filename` IPC を呼び出し、保存先パスプレビューを返すフック。
 * stale 応答の破棄は `requestIdRef` 世代 ID パターンで行う。
 * @param args - プレビュー引数
 * @returns プレビュー結果（初期値は pending）
 */
export const usePreviewTaskFilename = (
  args: UsePreviewTaskFilenameArgs,
): PreviewTaskFilenamePayload => {
  const [result, setResult] = useState<PreviewTaskFilenamePayload>({
    kind: "pending",
  });
  const requestIdRef = useRef(0);

  useEffect(() => {
    const currentId = ++requestIdRef.current;
    /** IPC を呼び出し、世代 ID が一致する場合のみ state を更新する。 */
    const fetch = async (): Promise<void> => {
      const res = await previewTaskFilename({
        title: args.title,
        explicitFilename: args.explicitFilename,
        parentFilePath: args.parentFilePath,
      });
      if (requestIdRef.current !== currentId) {
        return;
      }
      if (res.ok) {
        setResult(res.value);
      }
    };
    void fetch();
  }, [args.title, args.explicitFilename, args.parentFilePath]);

  return result;
};
