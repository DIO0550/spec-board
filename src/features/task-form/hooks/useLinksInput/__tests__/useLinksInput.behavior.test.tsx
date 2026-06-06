import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import {
  type UseLinksInputResult,
  useLinksInput,
} from "@/features/task-form/hooks/useLinksInput";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

/**
 * useLinksInput の戻り値を外部に公開するテスト用コンポーネント。
 * @param props - フック値を受け取るコールバック
 * @returns null
 */
const UseLinksInputProbe = ({
  onResult,
}: {
  onResult: (result: UseLinksInputResult) => void;
}) => {
  const result = useLinksInput();
  useEffect(() => {
    onResult(result);
  });
  return null;
};

const render = () => {
  let latest: UseLinksInputResult | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(UseLinksInputProbe, {
        onResult: (r) => {
          latest = r;
        },
      }),
    );
  });
  return () => latest as unknown as UseLinksInputResult;
};

test("初期 links は空配列", () => {
  const get = render();
  expect(get().links).toEqual([]);
});

test("addLink で links に反映される", () => {
  const get = render();
  act(() => {
    get().addLink("tasks/a.md");
  });
  expect(get().links).toEqual(["tasks/a.md"]);
});

test("removeLink で links から除外される", () => {
  const get = render();
  act(() => {
    get().addLink("tasks/a.md");
  });
  act(() => {
    get().removeLink("tasks/a.md");
  });
  expect(get().links).toEqual([]);
});

test("同一 filePath の addLink は dedup される", () => {
  const get = render();
  act(() => {
    get().addLink("tasks/a.md");
  });
  act(() => {
    get().addLink("tasks/a.md");
  });
  expect(get().links).toEqual(["tasks/a.md"]);
});

test("finalizeLinks は現 links 配列をそのまま返す", () => {
  const get = render();
  act(() => {
    get().addLink("tasks/a.md");
  });
  act(() => {
    get().addLink("tasks/b.md");
  });
  expect(get().finalizeLinks()).toEqual(["tasks/a.md", "tasks/b.md"]);
});
