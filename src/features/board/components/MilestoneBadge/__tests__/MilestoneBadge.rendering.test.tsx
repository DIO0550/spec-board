import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { MilestoneBadge } from "..";

test("title と due の両方が表示される", () => {
  const html = renderToStaticMarkup(
    createElement(MilestoneBadge, {
      name: "v0.3",
      definition: { name: "v0.3", title: "v0.3 リリース", due: "2026-07-31" },
    }),
  );
  expect(html).toContain("v0.3 リリース");
  expect(html).toContain("2026-07-31");
});

test("definition が undefined のとき name を表示し due は出ない", () => {
  const html = renderToStaticMarkup(
    createElement(MilestoneBadge, { name: "v0.3" }),
  );
  expect(html).toContain("v0.3");
  expect(html).not.toContain("milestone-badge__due");
});

test("title が無い definition では name をフォールバック表示する", () => {
  const html = renderToStaticMarkup(
    createElement(MilestoneBadge, {
      name: "v0.4",
      definition: { name: "v0.4", due: "2026-09-30" },
    }),
  );
  expect(html).toContain("v0.4");
  expect(html).toContain("2026-09-30");
});
