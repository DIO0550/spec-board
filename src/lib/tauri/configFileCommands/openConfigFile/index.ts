import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { OpenConfigFileArgs } from "../types";

export const openConfigFile = (
  args: OpenConfigFileArgs,
): Promise<Result<void, TauriError>> =>
  invokeWrapped<void>("open_config_file", { args });
