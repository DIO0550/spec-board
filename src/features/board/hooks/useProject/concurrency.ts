export type ProjectVersion = {
  current: number;
  active: boolean;
};

export type ProjectCommandQueue = {
  current: Promise<unknown>;
};

export const createProjectVersion = (): ProjectVersion => ({
  current: 0,
  active: true,
});

export const invalidateProject = (version: ProjectVersion): number => {
  version.current += 1;
  return version.current;
};

export const deactivateProject = (version: ProjectVersion): void => {
  version.active = false;
  invalidateProject(version);
};

export const isProjectCurrent = (
  version: ProjectVersion,
  snapshot: number,
): boolean => version.active && version.current === snapshot;

export const enqueueProjectCommand = <T>(
  queue: ProjectCommandQueue,
  run: () => Promise<T>,
): Promise<T> => {
  const next = queue.current.then(run);
  queue.current = next.catch(() => undefined);
  return next;
};
