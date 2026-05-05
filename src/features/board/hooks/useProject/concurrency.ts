export type ProjectVersion = {
  current: number;
  active: boolean;
};

export type ProjectCommandQueue = {
  current: Promise<unknown>;
};

/**
 * 現在の project 世代を追跡する mutable token を作成する。
 *
 * @returns active な初期 ProjectVersion
 */
export const createProjectVersion = (): ProjectVersion => ({
  current: 0,
  active: true,
});

/**
 * pending 中の project command を stale 扱いにするため世代を進める。
 *
 * @param version 更新対象の project version
 * @returns 更新後の世代番号
 */
export const invalidateProject = (version: ProjectVersion): number => {
  version.current += 1;
  return version.current;
};

/**
 * unmount 時に project version を無効化し、以後の async result を破棄させる。
 *
 * @param version 無効化する project version
 */
export const deactivateProject = (version: ProjectVersion): void => {
  version.active = false;
  invalidateProject(version);
};

/**
 * async command 開始時の世代が現在も有効か判定する。
 *
 * @param version 現在の project version
 * @param snapshot command 開始時に捕捉した世代番号
 * @returns 同じ世代かつ hook が active なら true
 */
export const isProjectCurrent = (
  version: ProjectVersion,
  snapshot: number,
): boolean => version.active && version.current === snapshot;

/**
 * project 単位で Tauri command を直列化する。
 *
 * @param queue project command queue
 * @param run queue 末尾で実行する async command
 * @returns command の実行結果
 */
export const enqueueProjectCommand = <T>(
  queue: ProjectCommandQueue,
  run: () => Promise<T>,
): Promise<T> => {
  const next = queue.current.then(run);
  queue.current = next.catch(() => undefined);
  return next;
};
