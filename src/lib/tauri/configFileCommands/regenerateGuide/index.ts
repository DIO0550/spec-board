import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { ConfigFilePayload } from "../types";

export const regenerateGuide = (): Promise<
  Result<ConfigFilePayload, TauriError>
> => invokeWrapped<ConfigFilePayload>("regenerate_guide");
