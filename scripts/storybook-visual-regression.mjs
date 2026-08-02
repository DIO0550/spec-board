#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { ODiffServer } from "odiff-bin";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseArgs = () => {
  const [command, ...tokens] = process.argv.slice(2);
  const args = tokens.filter((token) => token !== "--");
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]?.replace(/^--/, "");
    const value = args[index + 1];
    if (!key || value === undefined) {
      throw new Error(`Invalid argument near ${args[index] ?? ""}`);
    }
    options[key] = value;
  }
  return { command, options };
};

const listFiles = (dir) => {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
};

const contentType = (path) => {
  const map = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
  return map[extname(path)] ?? "application/octet-stream";
};

const serveStatic = async (root) => {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const decoded = decodeURIComponent(url.pathname);
    const target = join(root, decoded === "/" ? "index.html" : decoded);
    if (!target.startsWith(root) || !existsSync(target) || statSync(target).isDirectory()) {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    response.writeHead(200, { "content-type": contentType(target) });
    response.end(readFileSync(target));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start static server");
  }
  return { server, origin: `http://127.0.0.1:${address.port}` };
};

const requestJson = async (url, options) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${options?.method ?? "GET"} ${url} failed: ${response.status}`);
  }
  return response.json();
};

const requestOk = async (url, options) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${options?.method ?? "GET"} ${url} failed: ${response.status}`);
  }
  await response.arrayBuffer();
};

const findChrome = () => {
  const candidates = [process.env.CHROME_BIN, "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean);
  const found = candidates.find((candidate) => spawnSync(candidate, ["--version"], { stdio: "ignore" }).status === 0);
  if (!found) {
    throw new Error("Chrome is required. Install Google Chrome/Chromium or set CHROME_BIN.");
  }
  return found;
};

const openCdp = async (wsUrl) => {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data.toString());
    if (!message.id) {
      return;
    }
    const callbacks = pending.get(message.id);
    if (!callbacks) {
      return;
    }
    pending.delete(message.id);
    if (message.error) {
      callbacks.reject(new Error(message.error.message));
    } else {
      callbacks.resolve(message.result ?? {});
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const messageId = ++id;
    pending.set(messageId, { resolve, reject });
    socket.send(JSON.stringify({ id: messageId, method, params }));
  });
  return { send, close: () => socket.close() };
};

// ページ内で評価して、日本語グリフが notdef(豆腐)へフォールバックしていないか調べる。
// 同条件で「あ」「未割り当てコードポイント」「空白」を描き分け、ビットマップを比較する。
// 未割り当てコードポイントはどのフォントでも必ず notdef になるため、これと一致したら
// 「あ」も notdef、つまり日本語フォントが解決できていないと判定できる。
const japaneseGlyphProbe = () => {
  const draw = (text) => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    context.font = "48px sans-serif";
    context.textBaseline = "top";
    context.fillText(text, 0, 0);
    return canvas.toDataURL();
  };
  return { japanese: draw("あ"), notdef: draw("\u{10FFFD}"), blank: draw(" ") };
};

// Chrome は fontconfig 経由でフォントを解決するため、CJK フォントが無い環境では
// 日本語が豆腐(□)で描画される。豆腐は毎回同じ絵なので比較では差分として現れず、
// 気づかないまま baseline に焼き付いてしまう。撮影を始める前に落とす。
const assertJapaneseFontAvailable = async () => {
  const target = await requestJson(`http://127.0.0.1:9222/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" });
  const cdp = await openCdp(target.webSocketDebuggerUrl);
  try {
    const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", {
      expression: `(${japaneseGlyphProbe.toString()})()`,
      returnByValue: true,
    });
    if (exceptionDetails) {
      throw new Error(`Japanese font probe failed to evaluate: ${exceptionDetails.text ?? "unknown error"}`);
    }
    const { japanese, notdef, blank } = result.value;
    if (japanese === notdef || japanese === blank) {
      throw new Error(
        "No Japanese font is available to Chrome; Japanese text would be captured as tofu (□).\n" +
          "Install a CJK font before capturing, e.g. `apt-get install -y fonts-noto-cjk && fc-cache -f`.",
      );
    }
  } finally {
    cdp.close();
    await requestOk(`http://127.0.0.1:9222/json/close/${target.id}`);
  }
};

const capture = async (options) => {
  const storybookDir = options["storybook-dir"] ?? "storybook-static";
  const out = options.out ?? "visual-actual";
  const width = Number(options.width ?? 1280);
  const height = Number(options.height ?? 720);
  const settleMs = Number(options["settle-ms"] ?? 750);
  const stablePollMs = Number(options["stable-poll-ms"] ?? 250);
  const stableTimeoutMs = Number(options["stable-timeout-ms"] ?? 8000);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const { server, origin } = await serveStatic(process.cwd() + `/${storybookDir}`);
  // Chrome 136+ は remote debugging に非デフォルトの user-data-dir が必須。
  const userDataDir = mkdtempSync(join(tmpdir(), "storybook-visual-chrome-"));
  const chrome = spawn(
    findChrome(),
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--remote-debugging-port=9222",
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    // 起動失敗の原因を診断できるよう stderr だけ受け取る。
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  // stderr は dbus 警告などで際限なく増えるため末尾だけ保持する。
  let chromeStderr = "";
  chrome.stderr.setEncoding("utf8");
  chrome.stderr.on("data", (chunk) => {
    chromeStderr = (chromeStderr + chunk).slice(-4000);
  });
  let chromeExit = null;
  chrome.on("exit", (code, signal) => {
    chromeExit = { code, signal };
  });
  const describeChromeFailure = () => {
    const exit = chromeExit ? `exited with code=${chromeExit.code} signal=${chromeExit.signal}` : "still running";
    const stderr = chromeStderr.trim() || "(no stderr output)";
    return `Chrome DevTools endpoint did not start (${exit})\n--- chrome stderr ---\n${stderr}`;
  };
  try {
    let version;
    // 遅いランナーでも待てるよう 30 秒まで許容し、早期終了時は即座に諦める。
    for (let attempt = 0; attempt < 300; attempt += 1) {
      try {
        version = await requestJson("http://127.0.0.1:9222/json/version");
        break;
      } catch {
        if (chromeExit) {
          break;
        }
        await sleep(100);
      }
    }
    if (!version) {
      throw new Error(describeChromeFailure());
    }
    await assertJapaneseFontAvailable();
    const index = await requestJson(`${origin}/index.json`);
    const stories = Object.values(index.entries ?? {}).filter((entry) => entry.type === "story").sort((a, b) => a.id.localeCompare(b.id));
    writeFileSync(join(out, "stories.json"), JSON.stringify(stories.map(({ id, title, name }) => ({ id, title, name })), null, 2));
    const unstable = [];
    for (const story of stories) {
      const target = await requestJson(`http://127.0.0.1:9222/json/new?${encodeURIComponent(`${origin}/iframe.html?id=${story.id}`)}`, { method: "PUT" });
      const cdp = await openCdp(target.webSocketDebuggerUrl);
      await cdp.send("Page.enable");
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await sleep(settleMs);
      // 固定待ちのままだと非同期描画が終わる前に撮れてしまい、loading 表示が
      // baseline に焼き付く。同じフレームが 2 回続くまで待ってから採用する。
      const settledShot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      let screenshot = settledShot;
      let stable = false;
      const deadline = Date.now() + stableTimeoutMs;
      while (Date.now() < deadline) {
        await sleep(stablePollMs);
        const next = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        if (next.data === screenshot.data) {
          stable = true;
          break;
        }
        screenshot = next;
      }
      if (!stable) {
        // spinner 等は永久に安定しない。待ち続けた末の任意フレームより、
        // 従来どおり settle-ms 時点の再現性あるフレームを採用する。
        screenshot = settledShot;
        unstable.push(story.id);
      }
      writeFileSync(join(out, `${story.id}.png`), Buffer.from(screenshot.data, "base64"));
      cdp.close();
      await requestOk(`http://127.0.0.1:9222/json/close/${target.id}`);
      console.log(`captured ${story.id}${stable ? "" : " (never stabilized)"}`);
    }
    if (unstable.length > 0) {
      // 撮影は続けるが、アニメーション等で揺れ続けるストーリーは差分の温床なので明示する。
      console.warn(`warning: ${unstable.length} story(ies) never stabilized within ${stableTimeoutMs}ms: ${unstable.join(", ")}`);
    }
  } finally {
    chrome.kill("SIGTERM");
    await sleep(250);
    try {
      chrome.kill("SIGKILL");
    } catch {
      // already exited
    }
    server.close();
    // Chrome 終了直後は user-data-dir がまだ書き込み中のことがあるためリトライする。
    // それでも残った場合はキャプチャ自体は成功しているので握りつぶす。
    try {
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch (error) {
      console.warn(`failed to remove chrome user data dir: ${userDataDir}`, error);
    }
  }
};

const copy = (from, to) => writeFileSync(to, readFileSync(from));

const readStoryMetadata = (dir) => {
  const path = join(dir, "stories.json");
  if (!existsSync(path)) {
    return new Map();
  }
  const stories = JSON.parse(readFileSync(path, "utf8"));
  return new Map(stories.map((story) => [story.id, story]));
};

const compare = async (options) => {
  const expected = options.expected ?? "visual-baseline";
  const actual = options.actual ?? "visual-actual";
  const out = options.out ?? "visual-report";
  const maxDiffRatio = Number(options["max-diff-ratio"] ?? 0.002);
  const threshold = Number(options.threshold ?? 0.1);
  const reportVersion = options["report-version"] ?? "local";
  rmSync(out, { recursive: true, force: true });
  for (const dir of ["actual", "expected", "diff"]) {
    mkdirSync(join(out, dir), { recursive: true });
  }
  const actualNames = listFiles(actual).filter((path) => extname(path) === ".png").map((path) => basename(path));
  const expectedNames = listFiles(expected).filter((path) => extname(path) === ".png").map((path) => basename(path));
  const storyMetadata = new Map([...readStoryMetadata(expected), ...readStoryMetadata(actual)]);
  const names = [...new Set([...actualNames, ...expectedNames])].sort();
  const server = new ODiffServer();
  const results = [];
  try {
    for (const name of names) {
      const story = name.replace(/\.png$/, "");
      const metadata = storyMetadata.get(story);
      const actualPath = join(actual, name);
      const expectedPath = join(expected, name);
      const diffPath = join(out, "diff", name);
      if (!existsSync(expectedPath)) {
        copy(actualPath, join(out, "actual", name));
        results.push({ story, ...metadata, status: "new", reason: "no-baseline", diffPixels: 0, diffRatio: 0, hasExpected: false, hasActual: true, hasDiff: false });
        continue;
      }
      if (!existsSync(actualPath)) {
        copy(expectedPath, join(out, "expected", name));
        results.push({ story, ...metadata, status: "deleted", reason: "no-current", diffPixels: 0, diffRatio: 0, hasExpected: true, hasActual: false, hasDiff: false });
        continue;
      }
      copy(actualPath, join(out, "actual", name));
      copy(expectedPath, join(out, "expected", name));
      const result = await server.compare(expectedPath, actualPath, diffPath, {
        threshold,
        antialiasing: true,
        diffColor: "#ff00aa",
        failOnLayoutDiff: true,
        timeout: 30_000,
      });
      if (result.match) {
        results.push({ story, ...metadata, status: "passed", reason: "match", diffPixels: 0, diffRatio: 0, hasExpected: true, hasActual: true, hasDiff: false });
        continue;
      }
      if (result.reason !== "pixel-diff") {
        // 寸法違いなどピクセル比較まで到達しなかった失敗。odiff は diff 画像を出力しない。
        results.push({ story, ...metadata, status: "changed", reason: result.reason, diffPixels: 0, diffRatio: 1, hasExpected: true, hasActual: true, hasDiff: false });
        continue;
      }
      const diffRatio = result.diffPercentage / 100;
      const overThreshold = diffRatio > maxDiffRatio;
      results.push({
        story,
        ...metadata,
        status: overThreshold ? "changed" : "passed",
        reason: overThreshold ? "pixel-diff" : "within-threshold",
        diffPixels: result.diffCount,
        diffRatio,
        hasExpected: true,
        hasActual: true,
        hasDiff: existsSync(diffPath),
      });
    }
  } finally {
    server.stop();
  }
  const countOf = (status) => results.filter((result) => result.status === status).length;
  const summary = {
    reportVersion,
    maxDiffRatio,
    changed: countOf("changed"),
    new: countOf("new"),
    deleted: countOf("deleted"),
    passed: countOf("passed"),
    // 新規・削除は退行ではないので失敗に数えない(reg-suit と同じ扱い)。
    failed: countOf("changed"),
    results,
  };
  writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(out, "index.html"), renderHtml(summary));
  for (const result of results) {
    const storyDir = join(out, result.story);
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, "index.html"), renderHtml({ ...summary, results: [result] }, { detailStory: result.story, pathPrefix: "../" }));
  }
  if (summary.failed > 0) {
    process.exitCode = 1;
  }
};

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

// reg-viz のレポートに合わせた4分類。サイドバー・本文ともこの順で並べる。
const CATEGORIES = [
  { key: "changed", label: "Changed" },
  { key: "new", label: "New" },
  { key: "deleted", label: "Deleted" },
  { key: "passed", label: "Passed" },
];

const REASON_LABELS = {
  "pixel-diff": "Pixel diff",
  "layout-diff": "Layout diff",
  "file-not-exists": "File not exists",
  "within-threshold": "Within threshold",
  "no-baseline": "No baseline",
  "no-current": "No current snapshot",
  match: "Identical",
};

const storyLabel = (result) => {
  if (!result.title) {
    return result.story;
  }
  return result.name ? `${result.title} / ${result.name}` : result.title;
};

const storySearchText = (result) => `${result.title ?? ""} ${result.name ?? ""} ${result.story}`.toLowerCase();

// カードのサムネイル。差分画像があればそれを、無ければ手元にある方のスクリーンショットを使う。
const thumbnailKind = (result) => {
  if (result.hasDiff) {
    return "diff";
  }
  return result.hasActual ? "actual" : "expected";
};

// 詳細ページ(<story>/index.html)からは画像が1階層上、リンク先は自分自身になる。
const assetPrefix = (options) => options.pathPrefix ?? "";
const storyHref = (story, options) => (options.detailStory ? "./" : `${story}/`);

const groupByCategory = (results) => CATEGORIES
  .map((category) => ({ ...category, results: results.filter((result) => result.status === category.key) }))
  .filter((group) => group.results.length > 0);

// 表示順(Changed → New → Deleted → Passed)に並べ直した一覧。
// ビューアの前後送りとカウンタはこの順序を使う。
const orderResults = (results) => groupByCategory(results).flatMap((group) => group.results);

const ball = (status) => `<span class="ball ball--${status}" aria-hidden="true"></span>`;

const renderSidebar = (summary, options) => {
  const groups = groupByCategory(summary.results);
  const items = groups.map((group) => `<details class="group group--${group.key}" open>
        <summary>
          <span class="group__caret" aria-hidden="true"></span>
          <span class="group__name">${group.label}</span>
          <span class="group__count">${group.results.length} items</span>
          ${ball(group.key)}
        </summary>
        <ul class="group__list">
          ${group.results.map((result) => `<li data-nav-item data-search="${escapeHtml(storySearchText(result))}"><a href="${storyHref(escapeHtml(result.story), options)}" data-open="${escapeHtml(result.story)}" title="${escapeHtml(result.story)}">${escapeHtml(storyLabel(result))}</a></li>`).join("")}
        </ul>
      </details>`).join("");
  return `<aside class="sidebar" id="story-navigation" aria-label="Visual regression items">
      <div class="sidebar__search">
        <span class="icon-search" aria-hidden="true"></span>
        <input type="search" placeholder="Filter by file name" data-filter aria-label="Filter by file name">
      </div>
      <div class="sidebar__body">
        <p class="sidebar__label">Summary</p>
        ${items}
        <p class="sidebar__empty" data-filter-empty hidden>No matching items</p>
      </div>
      <footer class="sidebar__footer">
        <p class="sidebar__brand">Storybook Visual Regression</p>
        <p class="sidebar__version">Visual report UI v8 · ${escapeHtml(String(summary.reportVersion ?? "local").slice(0, 7))}</p>
      </footer>
    </aside>`;
};

const renderCard = (result, options) => {
  const story = escapeHtml(result.story);
  const metrics = result.status === "changed" && result.reason === "pixel-diff"
    ? `${(result.diffRatio * 100).toFixed(3)}% · ${result.diffPixels} px`
    : (REASON_LABELS[result.reason] ?? result.status);
  return `<li class="card card--${result.status}">
          <a class="card__open" href="${storyHref(story, options)}" data-open="${story}" aria-label="Open ${story}">
            <span class="card__thumb checker"><img loading="lazy" src="${assetPrefix(options)}${thumbnailKind(result)}/${story}.png" alt="${story}"></span>
            <span class="card__badge">${ball(result.status)}</span>
          </a>
          <div class="card__meta">
            <p class="card__name" title="${story}">${escapeHtml(storyLabel(result))}</p>
            <p class="card__sub">${escapeHtml(metrics)}</p>
          </div>
        </li>`;
};

const renderSections = (summary, options) => groupByCategory(summary.results).map((group) => `<section class="section" data-section="${group.key}">
      <h2 class="section__title">${group.label} items <span class="section__count">${group.results.length}</span></h2>
      <ul class="cards">
        ${group.results.map((result) => renderCard(result, options)).join("")}
      </ul>
    </section>`).join("");

const VIEW_MODES = [
  { key: "diff", label: "Diff" },
  { key: "slide", label: "Slide" },
  { key: "2up", label: "2up" },
  { key: "blend", label: "Blend" },
  { key: "toggle", label: "Toggle" },
];

const renderViewer = () => `<div class="viewer" data-viewer hidden>
    <header class="viewer__bar">
      <div class="viewer__title"><span data-viewer-ball></span><h2 data-viewer-name></h2></div>
      <p class="viewer__counter" data-viewer-counter></p>
      <button class="viewer__close" type="button" data-viewer-close aria-label="Close viewer">×</button>
    </header>
    <div class="viewer__body">
      <button class="viewer__nav viewer__nav--prev" type="button" data-viewer-prev aria-label="Previous item">‹</button>
      <div class="viewer__stage" data-viewer-stage></div>
      <button class="viewer__nav viewer__nav--next" type="button" data-viewer-next aria-label="Next item">›</button>
    </div>
    <nav class="modes" aria-label="Comparison mode">
      ${VIEW_MODES.map((mode) => `<button type="button" role="tab" data-view-mode="${mode.key}" aria-selected="false">${mode.label}</button>`).join("")}
    </nav>
  </div>`;

// summary.json をそのまま埋めるとレポートが重くなるので、ビューアが必要とする項目だけ渡す。
const reportData = (summary, options) => JSON.stringify({
  pathPrefix: options.pathPrefix ?? "",
  initialStory: options.detailStory ?? null,
  items: orderResults(summary.results).map((result) => ({
    story: result.story,
    label: storyLabel(result),
    status: result.status,
    reason: result.reason ?? null,
    diffPixels: result.diffPixels,
    diffRatio: result.diffRatio,
    hasExpected: result.hasExpected,
    hasActual: result.hasActual,
    hasDiff: result.hasDiff,
  })),
}).replaceAll("<", "\\u003c");

const renderStyles = () => `
    :root {
      color-scheme: light;
      --bg: #f2f5f5; --surface: #fff; --text: #0d3336; --muted: #7c8e90; --line: #dfe6e6;
      --accent: #ff4741; --changed: #e8384f; --deleted: #2b3a3c; --passed: #1f8ceb; --new-line: #8fa2a4;
      --checker: #e7ecec;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif; }
    h1, h2, p, figure { margin: 0; }
    /* 透過部分が分かるよう、reg-viz と同じ市松模様を画像の背面に敷く。 */
    .checker { background-color: #fff; background-image: linear-gradient(45deg, var(--checker) 25%, transparent 25%), linear-gradient(-45deg, var(--checker) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--checker) 75%), linear-gradient(-45deg, transparent 75%, var(--checker) 75%); background-size: 16px 16px; background-position: 0 0, 0 8px, 8px -8px, -8px 0; }
    .ball { display: inline-block; flex: 0 0 auto; width: 12px; height: 12px; border-radius: 999px; }
    .ball--changed { background: var(--changed); }
    .ball--new { background: #fff; box-shadow: inset 0 0 0 2px var(--new-line); }
    .ball--deleted { background: var(--deleted); }
    .ball--passed { background: var(--passed); }

    .app { display: grid; grid-template-columns: 300px minmax(0, 1fr); min-height: 100vh; }
    .sidebar { position: sticky; top: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; height: 100vh; border-right: 1px solid var(--line); background: var(--surface); }
    .sidebar__search { display: flex; align-items: center; gap: 10px; padding: 18px 20px; border-bottom: 1px solid var(--line); }
    .sidebar__search input { min-width: 0; width: 100%; border: 0; outline: 0; background: transparent; color: var(--text); font: inherit; font-size: 15px; }
    .sidebar__search input::placeholder { color: var(--muted); }
    .icon-search { position: relative; flex: 0 0 auto; width: 13px; height: 13px; border: 2px solid var(--muted); border-radius: 50%; }
    .icon-search::after { content: ""; position: absolute; right: -6px; bottom: -4px; width: 7px; height: 2px; background: var(--muted); transform: rotate(45deg); }
    .sidebar__body { min-height: 0; overflow: auto; padding: 20px 0 24px; }
    .sidebar__label { padding: 0 20px 8px; color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
    .group > summary { display: flex; align-items: center; gap: 8px; padding: 10px 20px; cursor: pointer; font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; list-style: none; }
    .group > summary::-webkit-details-marker { display: none; }
    .group > summary:hover { background: #f6f9f9; }
    .group__caret { flex: 0 0 auto; width: 0; height: 0; border-top: 5px solid var(--muted); border-right: 4px solid transparent; border-left: 4px solid transparent; transition: transform 120ms ease; }
    .group[open] > summary .group__caret { transform: rotate(180deg); }
    .group__name { margin-right: auto; }
    .group__count { color: var(--muted); font-size: 11px; font-weight: 600; letter-spacing: 0.04em; }
    .group__list { list-style: none; margin: 0 0 10px; padding: 0; }
    .group__list a { display: block; overflow: hidden; padding: 7px 20px 7px 32px; color: var(--text); font-size: 13px; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
    .group__list a:hover { background: #f6f9f9; color: var(--accent); }
    .sidebar__empty { padding: 24px 20px; color: var(--muted); font-size: 13px; }
    .sidebar__footer { padding: 16px 20px; border-top: 1px solid var(--line); }
    .sidebar__brand { font-size: 13px; font-weight: 700; }
    .sidebar__version { margin-top: 2px; color: var(--muted); font-size: 11px; }

    main { min-width: 0; padding: 44px 48px 72px; }
    .backlink { display: inline-block; margin-bottom: 20px; color: var(--muted); font-size: 13px; font-weight: 700; text-decoration: none; }
    .backlink:hover { color: var(--accent); }
    h1 { font-size: 56px; font-weight: 800; letter-spacing: -0.01em; line-height: 1.05; text-transform: uppercase; overflow-wrap: anywhere; }
    .lede { margin-top: 14px; max-width: 62ch; color: var(--muted); font-size: 14px; line-height: 1.7; }
    .totals { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
    .total { display: flex; align-items: center; gap: 8px; border: 1px solid var(--line); border-radius: 999px; padding: 8px 16px; background: var(--surface); font-size: 13px; font-weight: 700; }
    .total span:last-child { color: var(--muted); font-weight: 600; }
    .section { margin-top: 52px; }
    .section__title { display: flex; align-items: center; gap: 12px; font-size: 30px; font-weight: 800; letter-spacing: -0.01em; text-transform: uppercase; }
    .section__count { border-radius: 999px; padding: 3px 12px; background: var(--surface); border: 1px solid var(--line); font-size: 13px; font-weight: 700; }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 22px; list-style: none; margin: 22px 0 0; padding: 0; }
    .card { overflow: hidden; border-radius: 10px; background: var(--surface); box-shadow: 0 2px 10px rgb(13 51 54 / 8%); transition: transform 120ms ease, box-shadow 120ms ease; }
    .card:hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgb(13 51 54 / 14%); }
    .card__open { position: relative; display: block; height: 200px; }
    .card__thumb { display: block; height: 100%; }
    .card__thumb img { display: block; width: 100%; height: 100%; object-fit: contain; }
    .card__badge { position: absolute; top: 12px; left: 12px; display: grid; place-items: center; width: 26px; height: 26px; border-radius: 999px; background: var(--surface); box-shadow: 0 1px 4px rgb(13 51 54 / 22%); }
    .card__meta { padding: 14px 16px 16px; border-top: 1px solid var(--line); }
    .card__name { font-size: 13px; font-weight: 700; line-height: 1.5; overflow-wrap: anywhere; }
    .card__sub { margin-top: 4px; color: var(--muted); font-size: 12px; }

    .viewer { position: fixed; inset: 0; z-index: 50; display: grid; grid-template-rows: auto minmax(0, 1fr); background: var(--bg); }
    .viewer[hidden] { display: none; }
    .viewer__bar { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 16px; padding: 16px 24px; border-bottom: 1px solid var(--line); background: var(--surface); }
    .viewer__title { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .viewer__title h2 { overflow: hidden; font-size: 16px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
    .viewer__counter { color: var(--muted); font-size: 14px; font-weight: 700; white-space: nowrap; }
    .viewer__close { justify-self: end; width: 36px; height: 36px; border: 0; border-radius: 8px; background: transparent; color: var(--muted); font-size: 26px; line-height: 1; cursor: pointer; }
    .viewer__close:hover { background: #f0f4f4; color: var(--text); }
    .viewer__body { position: relative; min-height: 0; display: grid; grid-template-columns: 56px minmax(0, 1fr) 56px; align-items: stretch; }
    .viewer__nav { border: 0; background: transparent; color: var(--muted); font-size: 32px; line-height: 1; cursor: pointer; }
    .viewer__nav:hover { color: var(--text); }
    .viewer__nav:disabled { opacity: 0.25; cursor: default; }
    /* 下端の余白はフローティングのモード切替ぶん。スライダー等が隠れないようにする。 */
    .viewer__stage { min-width: 0; overflow: auto; padding: 28px 8px 120px; }

    /* 画像は原寸のまま上限だけ掛け、枠と操作列はその実寸に合わせて縮める。 */
    .stagewrap { width: fit-content; max-width: 100%; margin: 0 auto; }
    .frame { position: relative; overflow: hidden; width: fit-content; max-width: 100%; margin: 0 auto; border-radius: 8px; box-shadow: 0 2px 12px rgb(13 51 54 / 10%); }
    .vimg { display: block; max-width: 100%; max-height: calc(100vh - 300px); user-select: none; }
    /* 重ね合わせる側は下地と同じ矩形へ収める。寸法が違っても contain なので歪まない。 */
    .vimg--overlay { position: absolute; inset: 0; width: 100%; height: 100%; max-height: none; object-fit: contain; }
    .stack { position: absolute; inset: 0; overflow: hidden; }
    .handle { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--accent); pointer-events: none; }
    .handle::after { content: ""; position: absolute; top: 50%; left: 50%; width: 30px; height: 30px; border: 2px solid var(--accent); border-radius: 999px; background: var(--surface); transform: translate(-50%, -50%); }
    .control { display: grid; gap: 8px; margin-top: 16px; color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .control input[type="range"] { width: 100%; accent-color: var(--accent); }
    .toggle-bar { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 16px; }
    .toggle-bar button { border: 1px solid var(--line); border-radius: 999px; padding: 7px 18px; background: var(--surface); color: var(--text); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
    .toggle-bar button:hover { border-color: var(--accent); color: var(--accent); }
    .toggle-bar output { min-width: 72px; color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-align: center; text-transform: uppercase; }
    .twoup { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin: 0 auto; max-width: 1400px; }
    .pane { display: grid; grid-template-rows: auto minmax(0, 1fr); min-width: 0; overflow: hidden; border-radius: 8px; background: var(--surface); box-shadow: 0 2px 12px rgb(13 51 54 / 10%); }
    .pane figcaption { padding: 10px 14px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
    .pane__body { display: grid; min-height: 220px; place-items: center; }
    .pane__body .vimg { max-height: calc(100vh - 250px); }
    .pane__empty { color: var(--muted); font-size: 13px; }
    .unavailable { display: grid; min-height: 320px; max-width: 1100px; margin: 0 auto; place-items: center; border: 1px dashed var(--line); border-radius: 8px; padding: 24px; background: var(--surface); color: var(--muted); font-size: 14px; text-align: center; }

    .modes { position: fixed; bottom: 26px; left: 50%; z-index: 51; display: flex; gap: 4px; padding: 6px; border-radius: 999px; background: var(--surface); box-shadow: 0 8px 28px rgb(13 51 54 / 22%); transform: translateX(-50%); }
    .modes button { border: 0; border-radius: 999px; padding: 11px 26px; background: transparent; color: var(--text); font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; }
    .modes button:hover:not(:disabled):not(.is-active) { color: var(--accent); }
    .modes button.is-active { background: var(--accent); color: #fff; box-shadow: 0 0 0 3px rgb(255 71 65 / 22%); }
    .modes button:disabled { color: #c3cdcd; cursor: default; }

    @media (max-width: 1000px) {
      .app { grid-template-columns: 1fr; }
      .sidebar { position: static; height: auto; max-height: 60vh; }
      main { padding: 28px 20px 64px; }
      h1 { font-size: 36px; }
      .section__title { font-size: 22px; }
      .viewer__body { grid-template-columns: 36px minmax(0, 1fr) 36px; }
      .twoup { grid-template-columns: 1fr; }
      .modes { overflow-x: auto; max-width: calc(100vw - 24px); }
      .modes button { padding: 10px 16px; font-size: 13px; }
    }`;

const renderScript = () => `
    const data = JSON.parse(document.getElementById("report-data").textContent);
    const prefix = data.pathPrefix;
    const items = data.items;
    const indexOfStory = new Map(items.map((item, index) => [item.story, index]));
    const MODE_ORDER = ["diff", "slide", "2up", "blend", "toggle"];

    const filterInput = document.querySelector("[data-filter]");
    if (filterInput) {
      filterInput.addEventListener("input", () => {
        const query = filterInput.value.trim().toLowerCase();
        const navItems = [...document.querySelectorAll("[data-nav-item]")];
        for (const navItem of navItems) navItem.hidden = !navItem.dataset.search.includes(query);
        for (const group of document.querySelectorAll(".group")) {
          group.hidden = !group.querySelector("[data-nav-item]:not([hidden])");
          if (query && !group.hidden) group.open = true;
        }
        document.querySelector("[data-filter-empty]").hidden = navItems.some((navItem) => !navItem.hidden);
      });
    }

    const viewer = document.querySelector("[data-viewer]");
    const stage = viewer.querySelector("[data-viewer-stage]");
    const nameLabel = viewer.querySelector("[data-viewer-name]");
    const ballSlot = viewer.querySelector("[data-viewer-ball]");
    const counter = viewer.querySelector("[data-viewer-counter]");
    const prevButton = viewer.querySelector("[data-viewer-prev]");
    const nextButton = viewer.querySelector("[data-viewer-next]");
    const modeButtons = [...viewer.querySelectorAll("[data-view-mode]")];

    let current = -1;
    let mode = "diff";
    let disposeStage = null;

    const src = (kind, story) => prefix + kind + "/" + encodeURIComponent(story) + ".png";

    const image = (kind, item, overlay) => {
      const img = document.createElement("img");
      img.className = overlay ? "vimg vimg--overlay" : "vimg";
      img.src = src(kind, item.story);
      img.alt = kind + " screenshot of " + item.story;
      return img;
    };

    const unavailable = (text) => {
      const element = document.createElement("p");
      element.className = "unavailable";
      element.textContent = text;
      return element;
    };

    const pane = (label, item, kind, available) => {
      const figure = document.createElement("figure");
      figure.className = "pane";
      const caption = document.createElement("figcaption");
      caption.textContent = label;
      const body = document.createElement("div");
      body.className = "pane__body checker";
      if (available) {
        body.appendChild(image(kind, item));
      } else {
        const empty = document.createElement("span");
        empty.className = "pane__empty";
        empty.textContent = "Not available";
        body.appendChild(empty);
      }
      figure.append(caption, body);
      return figure;
    };

    const rangeControl = (label, value, onInput) => {
      const wrapper = document.createElement("label");
      wrapper.className = "control";
      const text = document.createElement("span");
      text.textContent = label;
      const input = document.createElement("input");
      input.type = "range";
      input.min = "0";
      input.max = "100";
      input.value = String(value);
      input.addEventListener("input", () => onInput(Number(input.value)));
      wrapper.append(text, input);
      onInput(value);
      return wrapper;
    };

    const bothSides = (item) => item.hasExpected && item.hasActual;

    const isModeAvailable = (item, candidate) => {
      if (candidate === "diff") return item.hasDiff;
      if (candidate === "2up") return true;
      return bothSides(item);
    };

    const buildDiff = (item) => {
      if (!item.hasDiff) {
        const note = item.reason === "layout-diff"
          ? "Baseline and current have different dimensions, so no pixel diff image was produced. Use 2up to compare."
          : "No diff image for this item.";
        return unavailable(note);
      }
      const frame = document.createElement("div");
      frame.className = "frame checker";
      frame.appendChild(image("diff", item));
      return frame;
    };

    const buildTwoUp = (item) => {
      const wrapper = document.createElement("div");
      wrapper.className = "twoup";
      wrapper.append(pane("Before", item, "expected", item.hasExpected), pane("After", item, "actual", item.hasActual));
      return wrapper;
    };

    const buildSlide = (item) => {
      const wrapper = document.createElement("div");
      wrapper.className = "stagewrap";
      const frame = document.createElement("div");
      frame.className = "frame checker";
      const after = document.createElement("div");
      after.className = "stack";
      after.appendChild(image("actual", item, true));
      const handle = document.createElement("div");
      handle.className = "handle";
      frame.append(image("expected", item), after, handle);
      const control = rangeControl("Before / After", 50, (value) => {
        after.style.clipPath = "inset(0 0 0 " + value + "%)";
        handle.style.left = value + "%";
      });
      wrapper.append(frame, control);
      return wrapper;
    };

    const buildBlend = (item) => {
      const wrapper = document.createElement("div");
      wrapper.className = "stagewrap";
      const frame = document.createElement("div");
      frame.className = "frame checker";
      const after = image("actual", item, true);
      frame.append(image("expected", item), after);
      const control = rangeControl("After opacity", 50, (value) => {
        after.style.opacity = String(value / 100);
      });
      wrapper.append(frame, control);
      return wrapper;
    };

    // 変更前後を一定間隔で入れ替えて表示する。差分の位置が残像で分かるので、
    // 微小な移動やフォントの差を見つけるのに一番速い。
    const buildToggle = (item) => {
      const wrapper = document.createElement("div");
      wrapper.className = "stagewrap";
      const frame = document.createElement("div");
      frame.className = "frame checker";
      const after = image("actual", item, true);
      frame.append(image("expected", item), after);

      const bar = document.createElement("div");
      bar.className = "toggle-bar";
      const playButton = document.createElement("button");
      playButton.type = "button";
      const stepButton = document.createElement("button");
      stepButton.type = "button";
      stepButton.textContent = "Step";
      const label = document.createElement("output");
      bar.append(playButton, label, stepButton);

      let showingAfter = true;
      let timer = null;
      const paint = () => {
        after.style.opacity = showingAfter ? "1" : "0";
        label.textContent = showingAfter ? "After" : "Before";
      };
      const flip = () => {
        showingAfter = !showingAfter;
        paint();
      };
      const stop = () => {
        if (timer !== null) clearInterval(timer);
        timer = null;
        playButton.textContent = "Play";
      };
      const start = () => {
        if (timer === null) timer = setInterval(flip, 600);
        playButton.textContent = "Pause";
      };
      playButton.addEventListener("click", () => (timer === null ? start() : stop()));
      stepButton.addEventListener("click", () => {
        stop();
        flip();
      });
      paint();
      start();
      wrapper.append(frame, bar);
      wrapper.dispose = stop;
      return wrapper;
    };

    const BUILDERS = { diff: buildDiff, "2up": buildTwoUp, slide: buildSlide, blend: buildBlend, toggle: buildToggle };

    const renderStage = () => {
      const item = items[current];
      if (disposeStage) disposeStage();
      disposeStage = null;
      stage.replaceChildren();
      if (!isModeAvailable(item, mode)) {
        stage.appendChild(unavailable("This mode needs both a baseline and a current screenshot."));
        return;
      }
      const content = BUILDERS[mode](item);
      disposeStage = content.dispose ?? null;
      stage.appendChild(content);
    };

    const syncModeButtons = () => {
      const item = items[current];
      for (const button of modeButtons) {
        const key = button.dataset.viewMode;
        const available = isModeAvailable(item, key);
        button.disabled = !available;
        const active = available && key === mode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", String(active));
      }
    };

    const show = (index) => {
      current = (index + items.length) % items.length;
      const item = items[current];
      if (!isModeAvailable(item, mode)) {
        mode = MODE_ORDER.find((candidate) => isModeAvailable(item, candidate)) ?? "2up";
      }
      nameLabel.textContent = item.label;
      nameLabel.title = item.story;
      ballSlot.className = "ball ball--" + item.status;
      counter.textContent = current + 1 + " / " + items.length;
      prevButton.disabled = items.length < 2;
      nextButton.disabled = items.length < 2;
      syncModeButtons();
      renderStage();
      viewer.hidden = false;
      document.body.style.overflow = "hidden";
    };

    const close = () => {
      if (disposeStage) disposeStage();
      disposeStage = null;
      stage.replaceChildren();
      viewer.hidden = true;
      document.body.style.overflow = "";
      if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
    };

    for (const button of modeButtons) {
      button.addEventListener("click", () => {
        mode = button.dataset.viewMode;
        syncModeButtons();
        renderStage();
      });
    }
    prevButton.addEventListener("click", () => show(current - 1));
    nextButton.addEventListener("click", () => show(current + 1));
    viewer.querySelector("[data-viewer-close]").addEventListener("click", close);
    document.addEventListener("keydown", (event) => {
      if (viewer.hidden) return;
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft" && items.length > 1) show(current - 1);
      if (event.key === "ArrowRight" && items.length > 1) show(current + 1);
    });

    for (const opener of document.querySelectorAll("[data-open]")) {
      opener.addEventListener("click", (event) => {
        // 修飾キー付きは別タブで詳細ページを開きたい操作なので、既定動作に任せる。
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        const index = indexOfStory.get(opener.dataset.open);
        if (index === undefined) return;
        event.preventDefault();
        show(index);
      });
    }

    const requested = data.initialStory ?? decodeURIComponent(window.location.hash.slice(1));
    if (requested && indexOfStory.has(requested)) show(indexOfStory.get(requested));`;

const renderHtml = (summary, options = {}) => {
  const totals = CATEGORIES.map((category) => `<span class="total">${ball(category.key)}<span>${category.label}</span><span>${summary[category.key] ?? 0}</span></span>`).join("");
  const heading = options.detailStory ? escapeHtml(options.detailStory) : "Report detail";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${options.detailStory ? `${escapeHtml(options.detailStory)} - ` : ""}Storybook Visual Regression Report</title>
  <style>${renderStyles()}
  </style>
</head>
<body>
  <div class="app">
    ${renderSidebar(summary, options)}
    <main>
      ${options.detailStory ? '<a class="backlink" href="../">← All items</a>' : ""}
      <h1>${heading}</h1>
      <p class="lede">Open an item to compare it with Diff, Slide, 2up, Blend and Toggle. Threshold: ${summary.maxDiffRatio} diff ratio.</p>
      <div class="totals">${totals}</div>
      ${renderSections(summary, options)}
    </main>
  </div>
  ${renderViewer()}
  <script type="application/json" id="report-data">${reportData(summary, options)}</script>
  <script>${renderScript()}
  </script>
</body>
</html>`;
};


const { command, options } = parseArgs();
if (command === "capture") {
  await capture(options);
} else if (command === "compare") {
  await compare(options);
} else {
  throw new Error("Usage: storybook-visual-regression.mjs <capture|compare> [--key value]");
}
