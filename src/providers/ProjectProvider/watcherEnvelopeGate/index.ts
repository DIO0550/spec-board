import {
  WatcherDiagnostic,
  type WatcherDiagnosticCode,
} from "@/domains/watcher-diagnostic";
import {
  type WatcherProjectKey,
  WatcherSession,
} from "@/domains/watcher-session";
import { Task, type TaskPayload } from "@/types/task";
import type { ProjectAction } from "../reducer";

/** BE と共有する watcher event 名。単一 effect でまとめて購読する。 */
export const WATCHER_EVENT_NAMES = [
  "task-created",
  "task-updated",
  "task-deleted",
  "watcher-resync-required",
  "watcher-diagnostic",
] as const;

/** watcher event の payload（event 名ではなく判別子で分岐する内部表現）。 */
export type WatcherPayload =
  | { readonly kind: "task-created"; readonly task: TaskPayload }
  | { readonly kind: "task-updated"; readonly task: TaskPayload }
  | { readonly kind: "task-deleted"; readonly filePath: string }
  | { readonly kind: "resync-required"; readonly reason: "rescan" }
  | {
      readonly kind: "diagnostic";
      readonly code: WatcherDiagnosticCode;
      readonly message: string;
      readonly paths: readonly string[];
    };

/** BE から届く envelope。IPC 外部契約なので外枠だけ runtime 検証を通す。 */
export type WatcherEnvelope = {
  readonly projectKey: WatcherProjectKey;
  readonly generation: number;
  readonly revision: number;
  /** cache を変更した envelope か。false なら revision の単調性を要求しない。 */
  readonly cacheMutating: boolean;
  readonly eventSeq: number;
  /** ログ相関用。判定には使わない。 */
  readonly changeId: string;
  readonly payload: WatcherPayload;
};

type RawRecord = Record<string, unknown>;

/**
 * 素の JSON オブジェクトかを判定する。配列と null を除外する。
 * @param value 判定対象
 * @returns プレーンなレコードなら true
 */
const isRecord = (value: unknown): value is RawRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * 文字列フィールドを取り出す。
 * @param value 判定対象
 * @returns 文字列ならその値、そうでなければ undefined
 */
const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/**
 * 有限数フィールドを取り出す。NaN / Infinity は順序判定に使えないため弾く。
 * @param value 判定対象
 * @returns 有限数ならその値、そうでなければ undefined
 */
const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/**
 * upsert 系 payload をパースする。
 * @param kind 判別子（created / updated）
 * @param raw 未検証の payload
 * @returns 判別子付き payload。task が無ければ null
 */
const parseTaskPayload = (
  kind: "task-created" | "task-updated",
  raw: RawRecord,
): WatcherPayload | null => {
  // task 本体は検証せずそのまま渡す。理由は parseWatcherEnvelope の doc を参照。
  if (!isRecord(raw.task)) {
    return null;
  }
  return { kind, task: raw.task as TaskPayload };
};

/**
 * 削除 payload をパースする。
 * @param raw 未検証の payload
 * @returns 判別子付き payload。filePath が無ければ null
 */
const parseDeletedPayload = (raw: RawRecord): WatcherPayload | null => {
  const filePath = asString(raw.filePath);
  if (filePath === undefined) {
    return null;
  }
  return { kind: "task-deleted", filePath };
};

/**
 * 再取得要求 payload をパースする。
 * @param raw 未検証の payload
 * @returns 判別子付き payload。既知の reason でなければ null
 */
const parseResyncPayload = (raw: RawRecord): WatcherPayload | null => {
  if (raw.reason !== "rescan") {
    return null;
  }
  return { kind: "resync-required", reason: "rescan" };
};

/**
 * 診断 payload をパースする。未知の code は unknown に丸めて通知自体は残す。
 * @param raw 未検証の payload
 * @returns 判別子付き payload。code / message が無ければ null
 */
const parseDiagnosticPayload = (raw: RawRecord): WatcherPayload | null => {
  const code = asString(raw.code);
  const message = asString(raw.message);
  if (code === undefined || message === undefined) {
    return null;
  }
  const paths = Array.isArray(raw.paths)
    ? raw.paths.filter((path): path is string => typeof path === "string")
    : [];
  return {
    kind: "diagnostic",
    code: WatcherDiagnostic.normalizeCode(code),
    message,
    paths,
  };
};

const PAYLOAD_PARSERS: Record<
  (typeof WATCHER_EVENT_NAMES)[number],
  (raw: RawRecord) => WatcherPayload | null
> = {
  "task-created": (raw) => parseTaskPayload("task-created", raw),
  "task-updated": (raw) => parseTaskPayload("task-updated", raw),
  "task-deleted": parseDeletedPayload,
  "watcher-resync-required": parseResyncPayload,
  "watcher-diagnostic": parseDiagnosticPayload,
};

/**
 * 未知の入力を envelope として検証する型ガード。
 *
 * # 検証範囲を外枠に限定する理由
 *
 * このリポジトリは pull 型（invoke）の payload を無検証で素通しする方針を採る
 * （`TaskProjection.fromPayload`: BE の payload 契約を信頼して素通しし、欠損
 * フィールドへの防御は入れない = fixture 漏れを隠さない）。push 型（listen）は
 * listen が型を保証しないため最小限の検証を入れるが、検証するのは envelope の
 * 外枠（identity / 順序フィールド / payload の判別子）だけにする。
 * `payload.task` の中身まで検証すると上記方針と矛盾し、contract fixture の漏れを
 * runtime のフォールバックで隠してしまう。
 *
 * @param eventName 受信した Tauri event 名
 * @param raw listen が渡した未検証の payload
 * @returns 検証を通った envelope。形が違えば null
 */
export const parseWatcherEnvelope = (
  eventName: string,
  raw: unknown,
): WatcherEnvelope | null => {
  const parsePayload =
    PAYLOAD_PARSERS[eventName as (typeof WATCHER_EVENT_NAMES)[number]];
  if (parsePayload === undefined) {
    return null;
  }
  if (!isRecord(raw)) {
    return null;
  }
  const projectKey = asString(raw.projectKey);
  const generation = asNumber(raw.generation);
  const revision = asNumber(raw.revision);
  const eventSeq = asNumber(raw.eventSeq);
  const changeId = asString(raw.changeId);
  if (
    projectKey === undefined ||
    generation === undefined ||
    revision === undefined ||
    eventSeq === undefined ||
    changeId === undefined ||
    typeof raw.cacheMutating !== "boolean" ||
    !isRecord(raw.payload)
  ) {
    return null;
  }
  const payload = parsePayload(raw.payload);
  if (payload === null) {
    return null;
  }
  return {
    projectKey: projectKey as WatcherProjectKey,
    generation,
    revision,
    cacheMutating: raw.cacheMutating,
    eventSeq,
    changeId,
    payload,
  };
};

/** gate の状態。`receive` は本値を書き換えず次状態を返す純粋関数。 */
export type WatcherGateState = {
  /** 未 load（`init` 前）を表す。この状態の受信はすべて discard する。 */
  readonly session: WatcherSession | null;
  readonly lastRevision: number;
  readonly lastEventSeq: number;
  readonly status: "synced" | "resyncing";
  /** resync 中に保留した **cache 変更** envelope（診断は積まない）。 */
  readonly buffer: readonly WatcherEnvelope[];
  /**
   * buffer が上限を超えて破棄されたか。
   *
   * 「buffer 内 gap」「buffer 内の resync-required」は `snapshotApplied` の
   * 畳み込みが `receive` を通す過程で自然に再検出されるのでフラグ不要。
   * 真にフラグが要るのは**破棄して情報が消えた**この経路だけ。
   */
  readonly bufferOverflowed: boolean;
  /**
   * 再取得がまだ解決していないことを表す dirty latch。
   *
   * `resyncFailed` は `status` を `synced` に戻すが、それだけだと**再取得が必要
   * だった事実そのものが消える**。`watcher-resync-required` を受けて `S` を進めた
   * 直後に `get_tasks` が失敗すると、次の envelope は連番として通常適用され、
   * BE が full rescan で作り直した cache が FE に永久に反映されない。
   * latch を立てておき、次の envelope（診断を含む）で必ず再取得へ入る。
   * 再取得の成功（`snapshotApplied`）でのみ解消する。
   */
  readonly resyncPending: boolean;
  /**
   * 直近に適用した診断 envelope の `changeId`（最大 16 件のリングバッファ）。
   * 診断は順序制御の対象外で `eventSeq` による重複排除ができないため、
   * ここで二重配信を弾く。
   */
  readonly recentDiagnosticIds: readonly string[];
};

export type WatcherDiscardReason =
  /** init 前（load 完了前）に届いた */
  | "not-initialized"
  /** projectKey 不一致 → S を進めない */
  | "foreign-project"
  /** 旧 watcher 世代 → S を進めない */
  | "stale-generation"
  /** 再配信 → S を進めない */
  | "duplicate-event"
  /** 追い越された古い cache 変更 → **S は進める** */
  | "stale-revision";

export type WatcherResyncReason = "rescan" | "event-gap";

export type WatcherGateDecision =
  | { readonly kind: "discard"; readonly reason: WatcherDiscardReason }
  | {
      readonly kind: "apply";
      readonly envelope: WatcherEnvelope;
      /**
       * 適用と**同時に**再取得も要すること。診断イベント専用。
       *
       * 診断は順序制御の対象外として必ず apply するが、watermark を診断の
       * `eventSeq` まで進めると、その手前で emit に失敗した cache 変更の欠番が
       * 診断に飲まれて gap 検知が効かなくなる。適用と再取得を同時に返すことで、
       * 通知を落とさずに欠落も拾う。
       */
      readonly alsoResync?: WatcherResyncReason;
    }
  | { readonly kind: "resync"; readonly reason: WatcherResyncReason }
  | { readonly kind: "buffer" };

/** `receive` の戻り値。次状態と decision を分離して返す。 */
export type WatcherGateStep = {
  readonly state: WatcherGateState;
  readonly decision: WatcherGateDecision;
};

/**
 * buffer の上限。超えたら buffer を捨てて `bufferOverflowed` を立てる。
 *
 * 件数上限にしているのは、replay には payload 本体（`task.body` を含む）が
 * 必要で、メタ情報だけ残しても再適用できないため。最悪ケースは
 * 「200 × Markdown 全文」の一時保持になるが、禁じているのは**毎 event に
 * 全 task を載せること**であって、稀な resync 中の一時 buffer は別問題として
 * 許容する。
 */
export const WATCHER_BUFFER_LIMIT = 200;

/** 診断 dedupe 用リングバッファの長さ。 */
export const WATCHER_DIAGNOSTIC_DEDUPE_SIZE = 16;

/**
 * decision と次状態を組にして返す。
 * @param state 次状態
 * @param decision 呼び出し側が適用する decision
 * @returns WatcherGateStep
 */
const step = (
  state: WatcherGateState,
  decision: WatcherGateDecision,
): WatcherGateStep => ({ state, decision });

/**
 * 診断 changeId をリングバッファへ追加する。
 * @param ids 既存の ID 列
 * @param changeId 追加する ID
 * @returns 末尾に追加し上限で古い方を落とした ID 列
 */
const rememberDiagnosticId = (
  ids: readonly string[],
  changeId: string,
): readonly string[] =>
  [...ids, changeId].slice(-WATCHER_DIAGNOSTIC_DEDUPE_SIZE);

/**
 * resync 中の envelope を buffer へ積む。上限超過なら捨ててフラグを立てる。
 * @param state 現在の gate 状態
 * @param pending 保留する envelope
 * @returns buffer 更新後の gate 状態
 */
const pushToBuffer = (
  state: WatcherGateState,
  pending: WatcherEnvelope,
): WatcherGateState => {
  if (state.buffer.length >= WATCHER_BUFFER_LIMIT) {
    return { ...state, buffer: [], bufferOverflowed: true };
  }
  return { ...state, buffer: [...state.buffer, pending] };
};

/**
 * 診断 envelope の判定（decision テーブル 行 3・4）。
 *
 * 診断は cache を変更しないので snapshot に subsume されない。行 5
 * （`eventSeq <= S`）で捨てると resync 中に届いた backend error が
 * `snapshotApplied` の watermark に飲まれて **toast が一度も出ない**。
 * したがって順序制御の対象外とし、status に関わらず即時 apply して buffer にも
 * 積まない。二重配信は `changeId` の直近リングバッファで弾く。
 * @param state 現在の gate 状態
 * @param received 受信した envelope
 * @returns 次状態と decision
 */
const receiveDiagnostic = (
  state: WatcherGateState,
  received: WatcherEnvelope,
): WatcherGateStep => {
  if (state.recentDiagnosticIds.includes(received.changeId)) {
    return step(state, { kind: "discard", reason: "duplicate-event" });
  }
  // 診断の手前に欠番があるなら、それは emit に失敗した cache 変更。watermark を
  // 進めるだけだと以後の連番が正常に見えて欠落が永久に回収されないため、
  // 再取得が要ることを latch に記録する。
  const revealsGap = received.eventSeq > state.lastEventSeq + 1;
  const needsResync = revealsGap || state.resyncPending;
  // 既に resyncing なら二重要求はせず latch に委ねる（in-flight の完了後に
  // `snapshotApplied` が `resyncRequired` として返す）。
  const requestsNow = needsResync && state.status === "synced";
  return step(
    {
      ...state,
      lastEventSeq: Math.max(state.lastEventSeq, received.eventSeq),
      status: requestsNow ? "resyncing" : state.status,
      resyncPending: needsResync,
      recentDiagnosticIds: rememberDiagnosticId(
        state.recentDiagnosticIds,
        received.changeId,
      ),
    },
    requestsNow
      ? { kind: "apply", envelope: received, alsoResync: "event-gap" }
      : { kind: "apply", envelope: received },
  );
};

/**
 * envelope 1 件を受け取り、次状態と decision を返す**全域関数**。
 *
 * discard 理由ごとに `lastEventSeq` を進めるかが異なる点に注意。
 * `foreign-project` / `stale-generation` は進めない（BE の generation guard と
 * `stop() → join` により、それらの seq は必ず現行 `S` 以下になるため欠番に
 * ならない）。`stale-revision` は**同一 session の連番を 1 つ消費している**ので
 * 進める（進めないと欠番が残り、次の envelope で必ず gap 判定になる自走ループ）。
 *
 * @param state 現在の gate 状態
 * @param received 受信した envelope
 * @returns 次状態と decision
 */
const receiveEnvelope = (
  state: WatcherGateState,
  received: WatcherEnvelope,
): WatcherGateStep => {
  if (state.session === null) {
    return step(state, { kind: "discard", reason: "not-initialized" });
  }
  if (received.projectKey !== state.session.projectKey) {
    return step(state, { kind: "discard", reason: "foreign-project" });
  }
  if (received.generation !== state.session.generation) {
    return step(state, { kind: "discard", reason: "stale-generation" });
  }
  if (!received.cacheMutating) {
    return receiveDiagnostic(state, received);
  }
  if (received.eventSeq <= state.lastEventSeq) {
    return step(state, { kind: "discard", reason: "duplicate-event" });
  }
  // 前回の再取得が未解決のまま。連番に見えても BE の cache 全置換を取りこぼした
  // ままなので、通常適用へ進まずに再取得からやり直す。
  if (state.resyncPending && state.status === "synced") {
    return step(pushToBuffer({ ...state, status: "resyncing" }, received), {
      kind: "resync",
      reason: "event-gap",
    });
  }
  if (state.status === "resyncing") {
    return step(pushToBuffer(state, received), { kind: "buffer" });
  }
  if (received.eventSeq > state.lastEventSeq + 1) {
    return step(pushToBuffer({ ...state, status: "resyncing" }, received), {
      kind: "resync",
      reason: "event-gap",
    });
  }
  const advanced = { ...state, lastEventSeq: received.eventSeq };
  if (received.revision <= state.lastRevision) {
    return step(advanced, { kind: "discard", reason: "stale-revision" });
  }
  if (received.payload.kind === "resync-required") {
    return step(
      { ...advanced, status: "resyncing" },
      { kind: "resync", reason: "rescan" },
    );
  }
  return step(
    { ...advanced, lastRevision: received.revision },
    { kind: "apply", envelope: received },
  );
};

/** `snapshotApplied` の戻り値。 */
export type WatcherSnapshotResult = {
  readonly state: WatcherGateState;
  /** snapshot を採用したか。false なら呼び出し側は dispatch してはならない。 */
  readonly accepted: boolean;
  /** buffer を畳み込んだ結果の decision 列（呼び出し側が順に適用する）。 */
  readonly decisions: readonly WatcherGateDecision[];
  /** true なら resync をもう一度発行する必要がある。 */
  readonly resyncRequired: boolean;
};

/** WatcherGate の companion API。 */
export const WatcherGate = {
  /** 未 load 状態の固定参照（Provider の ref 初期値）。 */
  initial: {
    session: null,
    lastRevision: 0,
    lastEventSeq: 0,
    status: "synced",
    buffer: [],
    bufferOverflowed: false,
    resyncPending: false,
    recentDiagnosticIds: [],
  } as WatcherGateState,

  /**
   * `open_project` / `get_tasks` 応答の session から初期状態を作る。
   * @param baseline BE が返した session
   * @returns 初期化済みの gate 状態
   */
  init: (baseline: WatcherSession): WatcherGateState => ({
    session: baseline,
    lastRevision: baseline.revision,
    lastEventSeq: baseline.eventSeq,
    status: "synced",
    buffer: [],
    bufferOverflowed: false,
    resyncPending: false,
    recentDiagnosticIds: [],
  }),

  /**
   * envelope 1 件を受け取り、次状態と decision を返す全域関数。
   * 分岐は decision テーブル（行 0〜10）と 1:1 に対応する。
   * @param state 現在の gate 状態
   * @param received 受信した envelope
   * @returns 次状態と decision
   */
  receive: receiveEnvelope,

  /**
   * `get_tasks` の snapshot を適用する。
   *
   * 1. identity を検証（別 session なら `accepted: false` で状態を変えずに返す）
   * 2. **baseline を session で丸ごと取り直す**。「replay 済み最大 seq」を使うと、
   *    buffer が全て破棄された場合に S が更新されず自走ループになる
   * 3. status を `synced` に戻し buffer を空にする
   * 4. 保留していた envelope を `receive` で順に畳み込む（判定経路を 1 本に統一する。
   *    buffer 内の gap / `resync-required` もここで自然に再検出される）
   * 5. `bufferOverflowed` が立っていれば `resyncRequired: true` を返す
   *
   * @param state 現在の gate 状態
   * @param applied `get_tasks` 応答の session
   * @returns 次状態・採否・畳み込み decision 列・再 resync の要否
   */
  snapshotApplied: (
    state: WatcherGateState,
    applied: WatcherSession,
  ): WatcherSnapshotResult => {
    if (
      state.session === null ||
      !WatcherSession.isSameSession(state.session, applied)
    ) {
      return { state, accepted: false, decisions: [], resyncRequired: false };
    }
    const pending = state.buffer;
    const overflowed = state.bufferOverflowed;
    // in-flight のあいだに立った latch もここで回収する（診断が欠番を露呈した等）。
    const pendingResync = state.resyncPending;
    let next: WatcherGateState = {
      ...state,
      session: applied,
      lastRevision: applied.revision,
      lastEventSeq: applied.eventSeq,
      status: "synced",
      buffer: [],
      bufferOverflowed: false,
      resyncPending: false,
    };
    const decisions: WatcherGateDecision[] = [];
    for (const item of pending) {
      const folded = receiveEnvelope(next, item);
      next = folded.state;
      decisions.push(folded.decision);
    }
    return {
      state: next,
      accepted: true,
      decisions,
      resyncRequired:
        overflowed ||
        pendingResync ||
        decisions.some((decision) => decision.kind === "resync"),
    };
  },

  /**
   * `get_tasks` を実際に発行する直前に通す遷移。
   *
   * `receive` が `resync` decision を返した経路では既に `resyncing` になっているが、
   * **buffer 溢れ由来の 2 本目**はそうではない（`snapshotApplied` が一度 `synced` に
   * 戻すため）。その状態で再取得すると、応答待ちのあいだに届いた envelope が即時
   * apply されたあと、より古い snapshot で上書きされて変更が失われる。発行経路を
   * すべてここへ通すことで「in-flight のあいだは必ず buffer」を保証する。
   *
   * buffer と watermark は保持する（既に `resyncing` なら実質何も変えない）。
   * @param state 現在の gate 状態
   * @returns resyncing に遷移した gate 状態
   */
  resyncStarted: (state: WatcherGateState): WatcherGateState =>
    state.status === "resyncing" ? state : { ...state, status: "resyncing" },

  /**
   * `get_tasks` を**実際に投げる直前**に通す遷移。未解決 latch をここで下ろす。
   *
   * `resyncStarted`（buffer を始める時点）で下ろすと、read barrier の待機中に
   * 診断が露呈した欠番まで「この再取得より前の債務」として消してしまう。実際には
   * barrier のあとに発行する snapshot がその欠落も含むため、2 本目は不要。逆に
   * latch を下ろすのが遅すぎると、投げた再取得が自分自身の債務を回収できない。
   * **発行の瞬間**が唯一正しい境界になる。
   *
   * これ以降に立つ latch は「この snapshot では回収できない新しい欠落」を表し、
   * `snapshotApplied` が `resyncRequired` として拾う。失敗時は `resyncFailed` が
   * 立て直すので債務が消えることはない。
   * @param state 現在の gate 状態
   * @returns 未解決 latch を下ろした gate 状態
   */
  resyncIssued: (state: WatcherGateState): WatcherGateState =>
    state.resyncPending ? { ...state, resyncPending: false } : state,

  /**
   * `get_tasks` が失敗した（またはバリア後に中断した）ときの出口。
   *
   * **これが無いと `status` が `resyncing` のまま残り、以後の envelope はすべて
   * buffer 行に落ちて `resync` decision が二度と出ない**。その結果 board は一切
   * 更新されず、project を開き直すまで復旧しない。
   *
   * buffer を捨てるのは有効な baseline が無いまま保持しても適用可否を判定
   * できないため。捨てても収束する: buffer にあった envelope が `S+1` 以降を
   * 消費済みなので、次の envelope は必ず `S+1` より大きくなり gap 検知で
   * 再 resync に入る。
   *
   * @param state 現在の gate 状態
   * @returns synced に戻した gate 状態
   */
  resyncFailed: (state: WatcherGateState): WatcherGateState => ({
    ...state,
    status: "synced",
    buffer: [],
    bufferOverflowed: false,
    // **latch は立てたまま**にする。`synced` に戻すだけだと「再取得が必要だった」
    // 事実が消え、`watcher-resync-required` 直後の失敗で BE の full rescan 結果が
    // 永久に反映されないまま連番だけが進む。
    resyncPending: true,
  }),

  /**
   * envelope を store へ流す `ProjectAction` に変換する。
   *
   * 再取得要求と診断は store の task 集合を動かさないので `null` を返す
   * （呼び出し側がそれぞれ resync 発行 / 通知へ振り分ける）。
   *
   * @param received apply 判定を通った envelope
   * @returns dispatch する action。非 task 系なら null
   */
  toAction: (received: WatcherEnvelope): ProjectAction | null => {
    const { payload } = received;
    switch (payload.kind) {
      case "task-created":
        return { type: "task-created", task: Task.fromPayload(payload.task) };
      case "task-updated":
        return {
          type: "task-updated",
          originalFilePath: payload.task.filePath,
          task: Task.fromPayload(payload.task),
        };
      case "task-deleted":
        return { type: "task-deleted", filePath: payload.filePath };
      case "resync-required":
      case "diagnostic":
        return null;
    }
  },
} as const;
