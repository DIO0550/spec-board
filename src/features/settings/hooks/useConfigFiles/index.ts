import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ConfigFileId,
  type ConfigFilePayload,
  getConfigFiles,
  type OpenConfigFileTarget,
  openConfigFile,
  regenerateGuide,
  revealConfigFolder,
} from "@/lib/tauri";

export type ConfigFilesStatus = "loading" | "ready" | "error";

export type UseConfigFilesResult = {
  status: ConfigFilesStatus;
  files: readonly ConfigFilePayload[];
  error?: string;
  toast?: string;
  isRegenerating: boolean;
  /** 設定ファイル一覧を取得し直す。 */
  reload: () => Promise<void>;
  /**
   * 設定ファイルの内容をクリップボードへコピーする。
   * @param id - コピーする設定ファイルの ID
   */
  copy: (id: ConfigFileId) => Promise<boolean>;
  /** GUIDE.md を再生成する。 */
  regenerate: () => Promise<boolean>;
  /**
   * 設定ファイルを OS 既定のアプリケーションで開く。
   * @param target - 開く対象の設定ファイル
   */
  openExternal: (target: OpenConfigFileTarget) => Promise<boolean>;
  /** `.spec-board` フォルダを OS のファイラで表示する。 */
  revealFolder: () => Promise<boolean>;
};

/**
 * 設定ファイル一覧の取得と、コピー・再生成・外部起動の操作をまとめるフック。
 * @param projectKey - プロジェクトの識別子。変化したら一覧を取得し直す
 * @returns 一覧の取得状態と操作callback
 */
export const useConfigFiles = (projectKey?: string): UseConfigFilesResult => {
  const [status, setStatus] = useState<ConfigFilesStatus>("loading");
  const [files, setFiles] = useState<readonly ConfigFilePayload[]>([]);
  const [error, setError] = useState<string>();
  const [toast, setToast] = useState<string>();
  const [isRegenerating, setIsRegenerating] = useState(false);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    if (projectKey === undefined) {
      return;
    }
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    setStatus("loading");
    setError(undefined);
    const result = await getConfigFiles();
    if (requestId !== requestIdRef.current) {
      return;
    }
    if (!result.ok) {
      setError(result.error.message);
      setStatus("error");
      return;
    }
    const payload = result.value;
    if (payload === undefined || !Array.isArray(payload.files)) {
      setFiles([]);
      setError("設定ファイルの応答形式が不正です");
      setStatus("error");
      return;
    }
    setFiles(payload.files);
    setStatus("ready");
  }, [projectKey]);

  useEffect(() => {
    if (projectKey === undefined) {
      requestIdRef.current += 1;
      setFiles([]);
      setError(undefined);
      setToast(undefined);
      setStatus("loading");
      return;
    }
    void reload();
  }, [projectKey, reload]);

  const copy = useCallback(
    async (id: ConfigFileId) => {
      const file = files.find((candidate) => candidate.id === id);
      if (file === undefined) {
        setError("コピーする設定ファイルが見つかりません");
        setToast("操作に失敗しました");
        return false;
      }
      try {
        await navigator.clipboard.writeText(file.content);
        setToast(`${file.name} をコピーしました`);
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setToast("操作に失敗しました");
        return false;
      }
    },
    [files],
  );

  const regenerate = useCallback(async () => {
    if (isRegenerating) {
      return false;
    }
    setIsRegenerating(true);
    const result = await regenerateGuide();
    setIsRegenerating(false);
    if (!result.ok) {
      setError(result.error.message);
      setToast("GUIDE.md の再生成に失敗しました");
      return false;
    }
    setFiles((current) =>
      current.map((file) =>
        file.id === result.value.id ? result.value : file,
      ),
    );
    setToast("GUIDE.md を再生成しました");
    return true;
  }, [isRegenerating]);

  const openExternal = useCallback(async (target: OpenConfigFileTarget) => {
    const result = await openConfigFile({ target });
    if (!result.ok) {
      setError(result.error.message);
      setToast("設定ファイルを開けませんでした");
    }
    return result.ok;
  }, []);

  const revealFolder = useCallback(async () => {
    const result = await revealConfigFolder();
    if (!result.ok) {
      setError(result.error.message);
      setToast("設定フォルダを開けませんでした");
    }
    return result.ok;
  }, []);

  return {
    status,
    files,
    error,
    toast,
    isRegenerating,
    reload,
    copy,
    regenerate,
    openExternal,
    revealFolder,
  };
};
