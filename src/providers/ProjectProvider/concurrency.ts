export type ProjectVersion = {
  current: number;
  openRequest: number;
};

export type ProjectCommandQueue = {
  current: Promise<unknown>;
};

/** project queue 上で実行される非同期 command。 */
export type AsyncProjectCommand<T> = () => Promise<T>;

/**
 * 現在の project 世代を追跡する mutable token を作成する。
 *
 * @returns 初期 ProjectVersion
 */
export const createProjectVersion = (): ProjectVersion => ({
  current: 0,
  openRequest: 0,
});

/**
 * openProject request の後勝ち判定に使う token を進める。
 *
 * @param version 更新対象の project version
 * @returns 更新後の open request 番号
 */
export const beginOpenRequest = (version: ProjectVersion): number => {
  version.openRequest += 1;
  return version.openRequest;
};

/**
 * pending 中の openProject request を stale 扱いにする。
 *
 * @param version 更新対象の project version
 * @returns 更新後の open request 番号
 */
export const invalidateOpenRequests = (version: ProjectVersion): number =>
  beginOpenRequest(version);

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
 * async command 開始時の世代が現在も有効か判定する。
 *
 * @param version 現在の project version
 * @param snapshot command 開始時に捕捉した世代番号
 * @returns 同じ世代なら true
 */
export const isProjectCurrent = (
  version: ProjectVersion,
  snapshot: number,
): boolean => version.current === snapshot;

/**
 * openProject request が現在も最新か判定する。
 *
 * @param version 現在の project version
 * @param snapshot open request 開始時に捕捉した番号
 * @returns 同じ open request なら true
 */
export const isOpenRequestCurrent = (
  version: ProjectVersion,
  snapshot: number,
): boolean => version.openRequest === snapshot;

/**
 * project 単位で Tauri command を直列化する。
 *
 * @param queue project command queue
 * @param run queue 末尾で実行する async command
 * @returns command の実行結果
 */
export const enqueueProjectCommand = <T>(
  queue: ProjectCommandQueue,
  run: AsyncProjectCommand<T>,
): Promise<T> => {
  const next = queue.current.then(run);
  queue.current = next.catch(() => undefined);
  return next;
};
