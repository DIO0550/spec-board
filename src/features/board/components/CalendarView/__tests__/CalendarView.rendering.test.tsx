import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Column } from "@/types/column";
import { Task, type TaskPayload } from "@/types/task";
import { CalendarView } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

/** hex は happy-dom / 実ブラウザで rgb() へ正規化されうるため両表記を許容する。 */
const HEX_1A2B3C = ["#1a2b3c", "rgb(26, 43, 60)"];

/**
 * event 背景の Tailwind クラス。
 * Tailwind v4 の自動コンテンツ検出は `__tests__` 配下も走査するため、完全形の
 * リテラルをこのファイルに置くと実装から消えても CSS が生成され続け、生成 CSS を
 * grep する確認が素通りしてしまう。連結して組み立て、完全形を残さない。
 */
const ACCENT_BG_CLASS =
  "bg-[color-mix(in_srgb,var(--calendar-event-" + "accent)_10%,transparent)]";

/**
 * 実装から削除された旧ハードコード配色クラス。
 * ACCENT_BG_CLASS と同じ理由で、Tailwind に拾われないよう接頭辞と色トーンを
 * 分けて持ち、完全形のリテラルをこのファイルへ残さない（列挙しただけで削除した
 * はずの CSS が生成され続けてしまう）。
 * priority dot と凡例が使い続ける `bg-amber-500` / `bg-red-600` / `bg-blue-500`
 * は変更後も残るため、この一覧には含めない。
 */
const REMOVED_EVENT_CLASSES: readonly [string][] = [
  ["border-l-zinc-", "400"],
  ["bg-zinc-", "500/10"],
  ["bg-zinc-", "400"],
  ["border-l-blue-", "600"],
  ["bg-blue-", "500/10"],
  ["bg-blue-", "600"],
  ["border-l-amber-", "500"],
  ["bg-amber-", "500/10"],
  ["border-l-violet-", "500"],
  ["bg-violet-", "500/10"],
  ["bg-violet-", "500"],
  ["border-l-green-", "600"],
  ["bg-green-", "500/10"],
  ["bg-green-", "600"],
  ["border-l-slate-", "400"],
  ["bg-slate-", "500/10"],
  ["bg-slate-", "400"],
].map(([prefix, tone]) => [prefix + tone]);

const JA_COLUMNS: readonly Column[] = [
  { name: "未着手", order: 0, color: "#1a2b3c" },
  { name: "進行中", order: 1 },
  { name: "完了", order: 2, color: "#00ff00" },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 3, 26, 12));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
});

/** @returns 指定 override を反映した Task */
const makeTask = (overrides: Partial<TaskPayload>): Task =>
  Task.fromPayload({
    id: overrides.id ?? "task",
    title: overrides.title ?? "タスク",
    status: overrides.status ?? "Todo",
    priority: overrides.priority,
    milestone: overrides.milestone,
    due: overrides.due,
    labels: overrides.labels ?? [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: overrides.filePath ?? `tasks/${overrides.id ?? "task"}.md`,
  });

/**
 * CalendarView を描画する。
 * @param props - CalendarView へ渡す props
 */
const renderCalendar = (props: {
  tasks: Task[];
  columns?: readonly Column[];
  doneColumn?: string;
}): void => {
  act(() => {
    root?.render(createElement(CalendarView, props));
  });
};

/**
 * @param taskId - 対象タスクの ID
 * @returns 指定 taskId の event ボタン
 */
const eventOf = (taskId: string): HTMLElement | null =>
  container?.querySelector(`[data-task-id="${taskId}"]`) ?? null;

/**
 * 要素へ click イベントを配送する。
 * @param element - click 対象
 */
const click = (element: Element | null | undefined): void => {
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

/**
 * @param scope - dot の設置箇所（today / upcoming / filter / detail）
 * @param status - dot が表す status
 * @returns 指定箇所・指定 status の status dot
 */
const dotOf = (scope: string, status: string): HTMLElement | null =>
  container?.querySelector(
    `[data-status-dot="${scope}"][data-status="${status}"]`,
  ) ?? null;

/** @returns 凡例の「完了」dot */
const legendDot = (): HTMLElement | null =>
  container?.querySelector('[data-legend-dot="done"]') ?? null;

/** 今日期限 2 件 + 21 日以内 2 件を 未着手 / 完了 の 2 status で用意する。 */
const twoStatusTasks = (): Task[] => [
  makeTask({ id: "t1", status: "未着手", due: "2026-04-26" }),
  makeTask({ id: "t2", status: "完了", due: "2026-04-26" }),
  makeTask({ id: "t3", status: "未着手", due: "2026-04-30" }),
  makeTask({ id: "t4", status: "完了", due: "2026-04-30" }),
];

test("日本語カラムのcolorがevent左ボーダーに反映される", () => {
  renderCalendar({
    tasks: [makeTask({ id: "t1", status: "未着手", due: "2026-04-27" })],
    columns: JA_COLUMNS,
    doneColumn: "完了",
  });

  const event = eventOf("t1");
  expect(event).not.toBeNull();
  expect(HEX_1A2B3C).toContain(event?.style.borderLeftColor ?? "");
});

test("event背景のcustom propertyに左ボーダーと同じ色が載る", () => {
  renderCalendar({
    tasks: [makeTask({ id: "t1", status: "未着手", due: "2026-04-27" })],
    columns: JA_COLUMNS,
    doneColumn: "完了",
  });

  const event = eventOf("t1");
  expect(event).not.toBeNull();
  expect(event?.style.getPropertyValue("--calendar-event-accent")).toBe(
    "#1a2b3c",
  );
  expect(event?.className).toContain(ACCENT_BG_CLASS);
});

test("color未設定のカラムは表示順indexの既定トークンになる", () => {
  renderCalendar({
    tasks: [makeTask({ id: "t1", status: "進行中", due: "2026-04-27" })],
    columns: JA_COLUMNS,
    doneColumn: "完了",
  });

  const event = eventOf("t1");
  expect(event).not.toBeNull();
  expect(event?.style.getPropertyValue("--calendar-event-accent")).toBe(
    "var(--color-column-accent-2)",
  );
  expect(event?.style.borderLeftColor).toBe("var(--color-column-accent-2)");
});

test("カラムのcolorを変更すると配色が追従する", () => {
  const tasks = [makeTask({ id: "t1", status: "未着手", due: "2026-04-27" })];
  renderCalendar({ tasks, columns: JA_COLUMNS, doneColumn: "完了" });

  renderCalendar({
    tasks,
    columns: [
      { name: "未着手", order: 0, color: "#ff0000" },
      { name: "進行中", order: 1 },
      { name: "完了", order: 2, color: "#00ff00" },
    ],
    doneColumn: "完了",
  });

  const event = eventOf("t1");
  expect(event).not.toBeNull();
  expect(["#ff0000", "rgb(255, 0, 0)"]).toContain(
    event?.style.borderLeftColor ?? "",
  );
  expect(event?.style.getPropertyValue("--calendar-event-accent")).toBe(
    "#ff0000",
  );
});

test("今日セクションのdotはstatusごとのaccent色になる", () => {
  renderCalendar({
    tasks: twoStatusTasks(),
    columns: JA_COLUMNS,
    doneColumn: "完了",
  });

  const todo = dotOf("today", "未着手");
  const done = dotOf("today", "完了");
  expect(todo).not.toBeNull();
  expect(done).not.toBeNull();
  expect(HEX_1A2B3C).toContain(todo?.style.backgroundColor ?? "");
  expect(["#00ff00", "rgb(0, 255, 0)"]).toContain(
    done?.style.backgroundColor ?? "",
  );
});

test("今後の予定セクションのdotはstatusごとのaccent色になる", () => {
  renderCalendar({
    tasks: twoStatusTasks(),
    columns: JA_COLUMNS,
    doneColumn: "完了",
  });

  const todo = dotOf("upcoming", "未着手");
  const done = dotOf("upcoming", "完了");
  expect(todo).not.toBeNull();
  expect(done).not.toBeNull();
  expect(HEX_1A2B3C).toContain(todo?.style.backgroundColor ?? "");
  expect(["#00ff00", "rgb(0, 255, 0)"]).toContain(
    done?.style.backgroundColor ?? "",
  );
});

test("ステータスfilterのdotはstatusごとのaccent色になる", () => {
  renderCalendar({
    tasks: twoStatusTasks(),
    columns: JA_COLUMNS,
    doneColumn: "完了",
  });

  const todo = dotOf("filter", "未着手");
  const done = dotOf("filter", "完了");
  expect(todo).not.toBeNull();
  expect(done).not.toBeNull();
  expect(HEX_1A2B3C).toContain(todo?.style.backgroundColor ?? "");
  expect(["#00ff00", "rgb(0, 255, 0)"]).toContain(
    done?.style.backgroundColor ?? "",
  );
});

test("詳細パネルのdotは選択中taskのaccent色になる", () => {
  renderCalendar({
    tasks: twoStatusTasks(),
    columns: JA_COLUMNS,
    doneColumn: "完了",
  });
  click(eventOf("t1"));

  const detail = dotOf("detail", "未着手");
  expect(detail).not.toBeNull();
  expect(HEX_1A2B3C).toContain(detail?.style.backgroundColor ?? "");
});

test("同じstatusはeventと4箇所のdotで同一色になる", () => {
  renderCalendar({
    tasks: twoStatusTasks(),
    columns: JA_COLUMNS,
    doneColumn: "完了",
  });
  click(eventOf("t1"));

  const event = eventOf("t1");
  const dots = ["today", "upcoming", "filter", "detail"].map((scope) =>
    dotOf(scope, "未着手"),
  );
  expect(event).not.toBeNull();
  expect(dots.filter((dot) => dot !== null)).toHaveLength(4);

  const colors = [
    event?.style.getPropertyValue("--calendar-event-accent") ?? "",
    ...dots.map((dot) => dot?.style.backgroundColor ?? ""),
  ];
  expect(new Set(colors).size).toBe(1);
});

test("columns未指定なら既定status順のindexで色が付く", () => {
  renderCalendar({
    tasks: [
      makeTask({ id: "t1", status: "Todo", due: "2026-04-27" }),
      makeTask({ id: "t2", status: "Done", due: "2026-04-28" }),
    ],
  });

  expect(eventOf("t1")?.style.getPropertyValue("--calendar-event-accent")).toBe(
    "var(--color-column-accent-1)",
  );
  expect(eventOf("t2")?.style.getPropertyValue("--calendar-event-accent")).toBe(
    "var(--color-column-accent-2)",
  );
});

test("columnsが空配列でも42セルとevent配色が成立する", () => {
  renderCalendar({
    tasks: [makeTask({ id: "t1", status: "未着手", due: "2026-04-27" })],
    columns: [],
  });

  expect(container?.querySelectorAll("[data-calendar-date]")).toHaveLength(42);
  expect(eventOf("t1")?.style.getPropertyValue("--calendar-event-accent")).toBe(
    "var(--color-column-accent-1)",
  );
});

test("パレット長を超えるstatusは既定トークンを循環して使う", () => {
  const columns: readonly Column[] = Array.from(
    { length: 7 },
    (_unused, index) => ({ name: `列${index}`, order: index }),
  );
  renderCalendar({
    tasks: [
      makeTask({ id: "t6", status: "列5", due: "2026-04-27" }),
      makeTask({ id: "t7", status: "列6", due: "2026-04-28" }),
    ],
    columns,
  });

  expect(eventOf("t6")?.style.getPropertyValue("--calendar-event-accent")).toBe(
    "var(--color-column-accent-6)",
  );
  expect(eventOf("t7")?.style.getPropertyValue("--calendar-event-accent")).toBe(
    "var(--color-column-accent-1)",
  );
});

test("不正なcolorは既定トークンへ倒れ生値がstyleに出ない", () => {
  renderCalendar({
    tasks: [makeTask({ id: "t1", status: "未着手", due: "2026-04-27" })],
    columns: [{ name: "未着手", order: 0, color: "red" }],
  });

  const event = eventOf("t1");
  expect(event?.style.getPropertyValue("--calendar-event-accent")).toBe(
    "var(--color-column-accent-1)",
  );
  expect(event?.getAttribute("style")).not.toContain("red");
});

test("config外statusはconfiguredの後ろのindexで色が付く", () => {
  renderCalendar({
    tasks: [makeTask({ id: "t1", status: "保留", due: "2026-04-27" })],
    columns: JA_COLUMNS,
    doneColumn: "完了",
  });

  expect(eventOf("t1")?.style.getPropertyValue("--calendar-event-accent")).toBe(
    "var(--color-column-accent-4)",
  );
});

test("非連番orderでも生order値でなく表示順indexを使う", () => {
  renderCalendar({
    tasks: [
      makeTask({ id: "t1", status: "第一", due: "2026-04-27" }),
      makeTask({ id: "t2", status: "第二", due: "2026-04-28" }),
      makeTask({ id: "t3", status: "第三", due: "2026-04-29" }),
    ],
    columns: [
      { name: "第三", order: 10 },
      { name: "第二", order: 5 },
      { name: "第一", order: 1 },
    ],
  });

  expect(eventOf("t1")?.style.getPropertyValue("--calendar-event-accent")).toBe(
    "var(--color-column-accent-1)",
  );
  expect(eventOf("t2")?.style.getPropertyValue("--calendar-event-accent")).toBe(
    "var(--color-column-accent-2)",
  );
  expect(eventOf("t3")?.style.getPropertyValue("--calendar-event-accent")).toBe(
    "var(--color-column-accent-3)",
  );
});

test("期限超過eventはstatus由来の色を持たず赤系のままになる", () => {
  renderCalendar({
    tasks: [makeTask({ id: "t1", status: "未着手", due: "2026-04-20" })],
    columns: JA_COLUMNS,
    doneColumn: "完了",
  });

  const event = eventOf("t1");
  expect(event?.className).toContain("border-l-red-600");
  expect(event?.className).toContain("bg-red-500/10");
  expect(event?.className).not.toContain(ACCENT_BG_CLASS);
  expect(event?.style.getPropertyValue("--calendar-event-accent")).toBe("");
  expect(event?.style.borderLeftColor).toBe("");
});

test("マイルストーン付きeventはstatus色を保ちborder-l-0で区別される", () => {
  renderCalendar({
    tasks: [
      makeTask({
        id: "t1",
        status: "未着手",
        due: "2026-04-30",
        milestone: "v0.3",
      }),
    ],
    columns: JA_COLUMNS,
    doneColumn: "完了",
  });

  const event = eventOf("t1");
  expect(event?.className).toContain("border-l-0");
  expect(event?.className).toContain("font-medium");
  expect(event?.className).not.toContain("bg-accent-soft");
  expect(event?.className).toContain(ACCENT_BG_CLASS);
  expect(event?.style.getPropertyValue("--calendar-event-accent")).toBe(
    "#1a2b3c",
  );
});

test("期限超過かつマイルストーン付きは期限超過の配色が勝つ", () => {
  renderCalendar({
    tasks: [
      makeTask({
        id: "t1",
        status: "未着手",
        due: "2026-04-20",
        milestone: "v0.3",
      }),
    ],
    columns: JA_COLUMNS,
    doneColumn: "完了",
  });

  const event = eventOf("t1");
  expect(event?.className).toContain("border-l-red-600");
  expect(event?.className).toContain("border-l-0");
  expect(event?.style.getPropertyValue("--calendar-event-accent")).toBe("");
});

test("凡例の完了dotはdoneColumnの色に追従する", () => {
  renderCalendar({
    tasks: [makeTask({ id: "t1", status: "完了", due: "2026-04-30" })],
    columns: JA_COLUMNS,
    doneColumn: "完了",
  });

  const legend = legendDot();
  expect(legend).not.toBeNull();
  expect(["#00ff00", "rgb(0, 255, 0)"]).toContain(
    legend?.style.backgroundColor ?? "",
  );
});

test("凡例の期限超過と期限当日は固定色のまま", () => {
  renderCalendar({
    tasks: [makeTask({ id: "t1", status: "完了", due: "2026-04-30" })],
    columns: JA_COLUMNS,
    doneColumn: "完了",
  });

  const legendSection = container?.textContent ?? "";
  expect(legendSection).toContain("期限超過");
  expect(container?.innerHTML).toContain("bg-red-600");
  expect(container?.innerHTML).toContain("bg-amber-500");
});

test("doneColumnが解決できないとき凡例の完了dotは中立色になる", () => {
  renderCalendar({
    tasks: [makeTask({ id: "t1", status: "未着手", due: "2026-04-30" })],
    columns: JA_COLUMNS,
  });

  expect(legendDot()?.style.backgroundColor).toBe("var(--color-accent)");
});

test("tasksが空でもcolumns指定があれば凡例の完了dotはdoneColumnの色になる", () => {
  renderCalendar({ tasks: [], columns: JA_COLUMNS, doneColumn: "完了" });

  expect(["#00ff00", "rgb(0, 255, 0)"]).toContain(
    legendDot()?.style.backgroundColor ?? "",
  );
});

test("tasksもcolumnsも空なら凡例の完了dotは中立色になる", () => {
  renderCalendar({ tasks: [], columns: [], doneColumn: "完了" });

  expect(legendDot()?.style.backgroundColor).toBe("var(--color-accent)");
});

test("完了taskのeventは打ち消し表示とstatus accentが共存する", () => {
  renderCalendar({
    tasks: [makeTask({ id: "t1", status: "完了", due: "2026-04-30" })],
    columns: JA_COLUMNS,
    doneColumn: "完了",
  });

  const event = eventOf("t1");
  expect(event?.className).toContain("line-through");
  expect(event?.className).toContain("opacity-60");
  expect(event?.style.getPropertyValue("--calendar-event-accent")).toBe(
    "#00ff00",
  );
});

test("週表示へ切り替えてもeventのaccentは月表示と同一になる", () => {
  renderCalendar({
    tasks: [makeTask({ id: "t1", status: "未着手", due: "2026-04-27" })],
    columns: JA_COLUMNS,
    doneColumn: "完了",
  });
  const monthAccent =
    eventOf("t1")?.style.getPropertyValue("--calendar-event-accent") ?? "";

  click(container?.querySelector("button[data-range='week']"));

  const weekEvent = eventOf("t1");
  expect(weekEvent).not.toBeNull();
  expect(weekEvent?.style.getPropertyValue("--calendar-event-accent")).toBe(
    monthAccent,
  );
});

test("同じpropsで再レンダーしてもaccentは変わらない", () => {
  const props = {
    tasks: [makeTask({ id: "t1", status: "未着手", due: "2026-04-27" })],
    columns: JA_COLUMNS,
    doneColumn: "完了",
  };
  renderCalendar(props);
  const first =
    eventOf("t1")?.style.getPropertyValue("--calendar-event-accent") ?? "";

  renderCalendar(props);

  expect(eventOf("t1")?.style.getPropertyValue("--calendar-event-accent")).toBe(
    first,
  );
});

test("同一statusのeventが複数あってもすべて同色になる", () => {
  renderCalendar({
    tasks: [
      makeTask({ id: "t1", status: "未着手", due: "2026-04-27" }),
      makeTask({ id: "t2", status: "未着手", due: "2026-04-28" }),
      makeTask({ id: "t3", status: "未着手", due: "2026-04-29" }),
    ],
    columns: JA_COLUMNS,
    doneColumn: "完了",
  });

  const events = ["t1", "t2", "t3"].map((id) => eventOf(id));
  expect(events.filter((event) => event !== null)).toHaveLength(3);
  const accents = events.map(
    (event) => event?.style.getPropertyValue("--calendar-event-accent") ?? "",
  );
  expect(new Set(accents).size).toBe(1);
});

test("statusフィルタを外して戻しても配色が維持される", () => {
  renderCalendar({
    tasks: [makeTask({ id: "t1", status: "未着手", due: "2026-04-27" })],
    columns: JA_COLUMNS,
    doneColumn: "完了",
  });
  const before =
    eventOf("t1")?.style.getPropertyValue("--calendar-event-accent") ?? "";
  const checkbox = container?.querySelector<HTMLInputElement>(
    'input[value="未着手"]',
  );
  expect(checkbox).not.toBeNull();

  act(() => {
    checkbox?.click();
  });
  expect(eventOf("t1")).toBeNull();

  act(() => {
    checkbox?.click();
  });

  const event = eventOf("t1");
  expect(event).not.toBeNull();
  expect(event?.style.getPropertyValue("--calendar-event-accent")).toBe(before);
});

test.each(
  REMOVED_EVENT_CLASSES,
)("旧ハードコード配色class %s がDOMに現れない", (removedClass) => {
  renderCalendar({
    tasks: [
      makeTask({ id: "t1", status: "Backlog", due: "2026-04-27" }),
      makeTask({ id: "t2", status: "Todo", due: "2026-04-28" }),
      makeTask({ id: "t3", status: "In Progress", due: "2026-04-29" }),
      makeTask({ id: "t4", status: "In Review", due: "2026-04-30" }),
      makeTask({ id: "t5", status: "Done", due: "2026-05-01" }),
    ],
    columns: [
      { name: "Backlog", order: 0 },
      { name: "Todo", order: 1 },
      { name: "In Progress", order: 2 },
      { name: "In Review", order: 3 },
      { name: "Done", order: 4 },
    ],
  });

  // event が 1 件も描画されていないと、どのクラス名でも自動的に緑になる。
  expect(container?.querySelectorAll("[data-task-id]")).toHaveLength(5);
  expect(container?.innerHTML ?? "").not.toContain(removedClass);
});
