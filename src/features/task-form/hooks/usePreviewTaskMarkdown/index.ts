import { useEffect, useRef, useState } from "react";
import { previewTaskMarkdown } from "@/lib/tauri";
import type { PreviewTaskMarkdownParams } from "@/lib/tauri/taskCommands/types";
import { TauriError } from "@/lib/tauri/tauriError";

export type PreviewMarkdownState =
  | { kind: "pending"; markdown: null; error: null }
  | { kind: "ready"; markdown: string; error: null }
  | { kind: "error"; markdown: null; error: TauriError };

const PENDING_STATE: PreviewMarkdownState = {
  kind: "pending",
  markdown: null,
  error: null,
};

/**
 * BE の shared document codec で Task Form preview を生成する。
 * request generation が一致する応答だけを採用し、古い成功値への fallback は行わない。
 */
export const usePreviewTaskMarkdown = (
  params: PreviewTaskMarkdownParams,
): PreviewMarkdownState => {
  const [state, setState] = useState<PreviewMarkdownState>(PENDING_STATE);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const currentId = ++requestIdRef.current;
    setState(PENDING_STATE);

    const fetch = async (): Promise<void> => {
      const result = await previewTaskMarkdown(params);
      if (requestIdRef.current !== currentId) {
        return;
      }
      if (result.ok) {
        if (typeof result.value !== "string") {
          setState({
            kind: "error",
            markdown: null,
            error: new TauriError(
              "UNKNOWN",
              "プレビューの Markdown を取得できませんでした",
            ),
          });
          return;
        }
        setState({ kind: "ready", markdown: result.value, error: null });
        return;
      }
      setState({ kind: "error", markdown: null, error: result.error });
    };

    void fetch();
    return () => {
      if (requestIdRef.current === currentId) {
        requestIdRef.current += 1;
      }
    };
  }, [params]);

  return state;
};
