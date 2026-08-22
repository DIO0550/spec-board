import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo } from "react";
import { userEvent, within } from "storybook/test";
import type { ProjectEvent } from "@/providers/ProjectProvider";
import { ProjectEventsContext } from "@/providers/ProjectProvider/context";
import {
  RecentProjectsProvider,
  useRecentProjects,
} from "@/providers/RecentProjectsProvider";
import { ToastProvider, useToastState } from "@/providers/ToastProvider";
import { ProjectNotificationsProvider } from ".";

type EventsHarness = {
  value: {
    /**
     * eventの購読を開始する。
     * @param listener - eventを受け取るcallback
     */
    subscribe: (listener: (event: ProjectEvent) => void) => () => void;
  };
  /**
   * 購読中のlistenerへeventを配る。
   * @param event - 配信するevent
   */
  emit: (event: ProjectEvent) => void;
};

/**
 * ProjectNotificationsProviderへ実イベントを渡せるStory専用event harness。
 * @returns Providerへ渡す value と、story から発火させる emit
 */
const createEventsHarness = (): EventsHarness => {
  const listeners = new Set<(event: ProjectEvent) => void>();
  return {
    value: {
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    emit: (event) => {
      listeners.forEach((listener) => {
        listener(event);
      });
    },
  };
};

type NotificationConsumerProps = {
  emit: EventsHarness["emit"];
};

/**
 * 通知副作用で更新されるtoast/recentの状態を目視するconsumer。
 * @param props - eventを発火させる emit
 */
const NotificationConsumer = ({ emit }: NotificationConsumerProps) => {
  const { toasts } = useToastState();
  const { projects } = useRecentProjects();
  return (
    <section className="w-[640px] rounded-xl border border-border bg-surface p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
        ProjectNotificationsProvider
      </p>
      <h2 className="mt-1 text-lg font-semibold text-foreground">
        イベント通知ブリッジ
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-surface-muted p-3">
          <p className="text-xs text-muted">Toast</p>
          <p className="text-2xl font-semibold text-foreground">
            {toasts.length}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface-muted p-3">
          <p className="text-xs text-muted">Recent projects</p>
          <p className="text-2xl font-semibold text-foreground">
            {projects.length}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            emit({
              type: "watcher-diagnostic",
              code: "resourceExhausted",
              message: "watch limit",
              changeId: "story-warning",
            })
          }
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          監視warning
        </button>
        <button
          type="button"
          onClick={() =>
            emit({
              type: "open-error",
              error: {
                kind: "invalid-state",
                message: "プロジェクトを開けませんでした",
              },
            })
          }
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          open error
        </button>
      </div>
    </section>
  );
};

/** 依存する3 Contextと制御可能eventsを正しい順序で組むprovider harness。 */
const ProjectNotificationsHarness = () => {
  const events = useMemo(createEventsHarness, []);
  return (
    <ToastProvider defaultDurationMs={60_000}>
      <RecentProjectsProvider>
        <ProjectEventsContext.Provider value={events.value}>
          <ProjectNotificationsProvider>
            <NotificationConsumer emit={events.emit} />
          </ProjectNotificationsProvider>
        </ProjectEventsContext.Provider>
      </RecentProjectsProvider>
    </ToastProvider>
  );
};

const meta = {
  component: ProjectNotificationsHarness,
} satisfies Meta<typeof ProjectNotificationsHarness>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = {
  /**
   * 監視warningを発火させ、toastが出た状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "監視warning" }),
    );
  },
};
export const EdgeCases: Story = {
  /**
   * 監視warningとopen errorを続けて発火させた状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "監視warning" }));
    await userEvent.click(canvas.getByRole("button", { name: "open error" }));
  },
};
