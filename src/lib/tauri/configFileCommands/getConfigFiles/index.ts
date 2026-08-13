import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { GetConfigFilesPayload } from "../types";

export const getConfigFiles = (): Promise<
  Result<GetConfigFilesPayload, TauriError>
> => invokeWrapped<GetConfigFilesPayload>("get_config_files");
