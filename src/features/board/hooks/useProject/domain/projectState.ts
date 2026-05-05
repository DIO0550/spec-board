import type { TauriError } from "@/lib/tauri";
import type { ProjectData } from "./projectData";

export type ProjectState =
  | { kind: "idle" }
  | { kind: "loading"; path: string }
  | { kind: "loaded"; path: string; data: ProjectData }
  | { kind: "error"; path: string; error: TauriError };

type ProjectDataMapper = (data: ProjectData) => ProjectData;

export const ProjectState = {
  initial: { kind: "idle" } satisfies ProjectState,

  canAcceptCrud: (state: ProjectState): boolean => state.kind === "loaded",

  visibleData: (state: ProjectState): ProjectData | null =>
    state.kind === "loaded" ? state.data : null,

  openStart: (_state: ProjectState, path: string): ProjectState => ({
    kind: "loading",
    path,
  }),

  openSucceed: (path: string, data: ProjectData): ProjectState => ({
    kind: "loaded",
    path,
    data,
  }),

  openFail: (path: string, error: TauriError): ProjectState => ({
    kind: "error",
    path,
    error,
  }),

  updateData: (state: ProjectState, update: ProjectDataMapper): ProjectState =>
    state.kind === "loaded" ? { ...state, data: update(state.data) } : state,

  reset: (): ProjectState => ProjectState.initial,
} as const;
