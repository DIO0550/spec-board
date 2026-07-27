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
        results.push({ story, ...metadata, status: "added", diffPixels: 0, diffRatio: 0, hasExpected: false, hasActual: true, hasDiff: false });
        continue;
      }
      if (!existsSync(actualPath)) {
        copy(expectedPath, join(out, "expected", name));
        results.push({ story, ...metadata, status: "removed", diffPixels: 0, diffRatio: 0, hasExpected: true, hasActual: false, hasDiff: false });
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
        results.push({ story, ...metadata, status: "passed", diffPixels: 0, diffRatio: 0, hasExpected: true, hasActual: true, hasDiff: false });
        continue;
      }
      if (result.reason !== "pixel-diff") {
        results.push({ story, ...metadata, status: result.reason, diffPixels: 0, diffRatio: 1, hasExpected: true, hasActual: true, hasDiff: false });
        continue;
      }
      const diffRatio = result.diffPercentage / 100;
      results.push({
        story,
        ...metadata,
        status: diffRatio > maxDiffRatio ? "changed" : "passed",
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
  const failedStatuses = new Set(["changed", "layout-diff", "file-not-exists"]);
  const failed = results.filter((result) => failedStatuses.has(result.status));
  const summary = { reportVersion, maxDiffRatio, failed: failed.length, results };
  writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(out, "index.html"), renderHtml(summary));
  for (const result of results) {
    const storyDir = join(out, result.story);
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, "index.html"), renderHtml({ ...summary, results: [result] }, { detailStory: result.story, pathPrefix: "../" }));
  }
  if (failed.length > 0) {
    process.exitCode = 1;
  }
};

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const comparisonPanel = (result, pathPrefix = "") => {
  const story = escapeHtml(result.story);
  const expectedPath = `${pathPrefix}expected/${story}.png`;
  const actualPath = `${pathPrefix}actual/${story}.png`;
  const diffPath = `${pathPrefix}diff/${story}.png`;
  const canCompare = result.hasExpected && result.hasActual && result.status !== "layout-diff";
  const imageOrEmpty = (label, path, enabled) => enabled
    ? `<figure class="comparison__pane"><figcaption>${label}</figcaption><img class="comparison__image" src="${path}" alt="${label} ${story}"></figure>`
    : `<div class="comparison__pane comparison__pane--empty"><strong>${label}</strong><span>Not available</span></div>`;
  // Baseline と Current を difference 合成で重ねる。一致部分は黒に沈み、差分だけが発色する。
  // 差分ゼロだと全面が黒くなり情報量がないため、その場合は合成せず明示する。
  const overlayPane = !canCompare
    ? '<div class="comparison__pane comparison__pane--empty"><strong>Overlay</strong><span>Not available</span></div>'
    : result.diffPixels > 0
      ? `<figure class="comparison__pane">
        <figcaption>Overlay</figcaption>
        <div class="comparison__frame comparison__frame--pane comparison__frame--difference">
          <img class="comparison__image" src="${expectedPath}" alt="Baseline ${story}">
          <img class="comparison__image comparison__overlay" src="${actualPath}" alt="Current ${story}">
        </div>
      </figure>`
      : '<div class="comparison__pane comparison__pane--empty"><strong>Overlay</strong><span>No visual difference</span></div>';
  return `<div class="comparison" data-comparison>
    <div class="comparison__view" data-view="overlay">
      ${canCompare ? `
      <div data-overlay>
        <div class="comparison__frame">
          <img class="comparison__image" src="${expectedPath}" alt="Baseline ${story}">
          <img class="comparison__image comparison__overlay" src="${actualPath}" alt="Current ${story}" data-overlay-image style="opacity: 0.5">
        </div>
        <label class="comparison__control">Current opacity<input data-overlay-slider type="range" min="0" max="100" value="50" aria-label="Current opacity for ${story}"></label>
      </div>
      ` : '<div class="comparison__unavailable">Overlay is unavailable because this story only has one snapshot.</div>'}
    </div>
    <div class="comparison__view" data-view="split" hidden>
      <div class="comparison__split">
        ${imageOrEmpty("Baseline", expectedPath, result.hasExpected)}
        ${imageOrEmpty("Current", actualPath, result.hasActual)}
        ${overlayPane}
        ${imageOrEmpty("Diff", diffPath, result.hasDiff)}
      </div>
    </div>
    <div class="comparison__view" data-view="slider" hidden>
      ${canCompare ? `
      <div class="comparison__frame">
        <img class="comparison__image" src="${expectedPath}" alt="Baseline ${story}">
        <div class="comparison__actual" data-actual style="clip-path: inset(0 0 0 50%)"><img class="comparison__image" src="${actualPath}" alt="Current ${story}"></div>
        <div class="comparison__handle" data-handle style="left: 50%"></div>
      </div>
      <label class="comparison__control">Baseline / Current<input data-slider type="range" min="0" max="100" value="50" aria-label="Baseline current slider for ${story}"></label>
      ` : '<div class="comparison__unavailable">Slider is unavailable for this story.</div>'}
    </div>
  </div>`;
};

const renderStory = (result, options = {}) => {
  const story = escapeHtml(result.story);
  const ratio = (result.diffRatio * 100).toFixed(4);
  const pathPrefix = options.pathPrefix ?? "";
  const titleHref = options.detailStory ? `${pathPrefix}index.html#${story}` : `${story}/`;
  const storyLinkAttribute = options.detailStory ? "" : ` data-story-link="${story}"`;
  return `<article class="story story--${result.status}" id="${story}">
    <header class="story__header">
      <div>
        <p class="status">${result.status}</p>
        <h2><a href="${titleHref}"${storyLinkAttribute}>${story}</a></h2>
      </div>
      <dl class="metrics">
        <div><dt>Diff pixels</dt><dd>${result.diffPixels}</dd></div>
        <div><dt>Diff ratio</dt><dd>${ratio}%</dd></div>
      </dl>
    </header>
    ${comparisonPanel(result, pathPrefix)}
  </article>`;
};

const formatStatusLabel = (status) => {
  if (status === "passed") {
    return "Clear";
  }
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const storyTreePath = (result) => {
  if (result.title) {
    return result.title.split("/").filter(Boolean);
  }
  const componentId = result.story.split("--")[0];
  const [root, ...rest] = componentId.split("-").filter(Boolean);
  if (!root) {
    return ["Other"];
  }
  return rest.length > 0 ? [root, rest.join("-")] : [root];
};

const renderStoryTree = (stories) => {
  const root = { children: new Map(), stories: [] };
  for (const result of stories) {
    const titleParts = storyTreePath(result);
    let node = root;
    for (const part of titleParts) {
      if (!node.children.has(part)) {
        node.children.set(part, { children: new Map(), stories: [] });
      }
      node = node.children.get(part);
    }
    node.stories.push(result);
  }

  const renderNode = (node) => `${[...node.children.entries()].map(([label, child]) => `<li data-tree-node>
    <details open>
      <summary><span class="tree-icon tree-icon--folder" aria-hidden="true"></span><span>${escapeHtml(label)}</span></summary>
      <ul>${renderNode(child)}</ul>
    </details>
  </li>`).join("")}${node.stories.map((result) => {
    const story = escapeHtml(result.story);
    const label = escapeHtml(result.name ?? result.story.split("--").at(-1) ?? result.story);
    const searchText = escapeHtml(`${result.title ?? ""} ${result.name ?? ""} ${result.story}`.toLowerCase());
    return `<li class="story-nav__story" data-tree-leaf data-search-text="${searchText}"><a href="#${story}" title="${story}"><span class="tree-icon tree-icon--file" aria-hidden="true"></span><span>${label}</span></a></li>`;
  }).join("")}`;

  return `<ul class="story-nav__tree">${renderNode(root)}</ul>`;
};

const renderSidebar = (summary, options = {}) => {
  if (options.detailStory) {
    return "";
  }
  const groups = ["changed", "layout-diff", "file-not-exists", "added", "removed", "passed"]
    .map((status) => ({
      status,
      stories: summary.results.filter((result) => result.status === status),
    }))
    .filter((group) => group.stories.length > 0);

  if (groups.length === 0) {
    return "";
  }

  return `<aside class="story-nav" id="story-navigation" aria-label="Story result navigation">
    <header class="story-nav__header">
      <div class="story-nav__title"><h2>Story files</h2><span>${summary.results.length}</span></div>
      <button class="story-nav__close" type="button" data-nav-toggle aria-label="Hide story files" aria-controls="story-navigation" aria-expanded="true">‹</button>
      <label class="story-nav__filter"><span class="tree-icon tree-icon--search" aria-hidden="true"></span><input type="search" placeholder="Filter stories..." data-story-filter aria-label="Filter stories"></label>
    </header>
    <div class="story-nav__scroll" data-story-tree>
      ${groups.map((group) => `<details class="story-nav__group story-nav__group--${group.status}" open data-status-group>
        <summary><span>${formatStatusLabel(group.status)}</span><span class="story-nav__count">${group.stories.length}</span></summary>
        ${renderStoryTree(group.stories)}
      </details>`).join("")}
      <p class="story-nav__empty" data-filter-empty hidden>No matching stories</p>
    </div>
  </aside>`;
};

const renderInspectorTabs = (reportVersion) => `<nav class="inspector-tabs" aria-label="Diff inspector view">
  <span class="inspector-tabs__label">View</span>
  <div class="inspector-tabs__list" role="tablist">
    <button type="button" class="is-active" role="tab" data-global-view-mode="overlay" aria-selected="true">Overlay</button>
    <button type="button" role="tab" data-global-view-mode="split" aria-selected="false">Split + Diff</button>
    <button type="button" role="tab" data-global-view-mode="slider" aria-selected="false">Slider</button>
  </div>
  <span class="inspector-tabs__hint">Visual report UI v7 · ${escapeHtml(reportVersion.slice(0, 7))}</span>
</nav>`;

const renderHtml = (summary, options = {}) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${options.detailStory ? `${escapeHtml(options.detailStory)} - ` : ""}Storybook Visual Regression Report</title>
  <style>
    :root { color-scheme: light dark; --bg: #0f172a; --panel: #111827; --text: #e5e7eb; --muted: #9ca3af; --line: #374151; --accent: #38bdf8; --danger: #fb7185; --ok: #34d399; --warn: #fbbf24; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .layout { position: relative; display: grid; grid-template-columns: 320px minmax(0, 1fr); width: 100%; min-height: 100vh; transition: grid-template-columns 160ms ease; }
    .layout--nav-hidden { grid-template-columns: 0 minmax(0, 1fr); }
    .layout--nav-hidden .story-nav { visibility: hidden; opacity: 0; pointer-events: none; }
    .layout--detail { display: block; width: 100%; }
    main { min-width: 0; padding: 24px; }
    .hero { display: flex; justify-content: space-between; gap: 24px; align-items: flex-end; margin-bottom: 24px; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 32px; }
    a { color: inherit; }
    .summary { color: var(--muted); margin-top: 8px; }
    .hero__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
    .badge { border: 1px solid var(--line); border-radius: 999px; padding: 8px 12px; background: rgb(255 255 255 / 6%); }
    .nav-reveal { display: none; position: sticky; top: 0; z-index: 3; align-self: start; width: 34px; height: 42px; border: 1px solid var(--line); border-left: 0; border-radius: 0 10px 10px 0; background: #1f2937; color: var(--text); cursor: pointer; }
    .layout--nav-hidden .nav-reveal { display: block; position: absolute; left: 0; }
    .story-nav { position: sticky; top: 0; align-self: start; display: grid; grid-template-rows: auto minmax(0, 1fr); box-sizing: border-box; height: 100vh; overflow: hidden; border-right: 1px solid var(--line); background: #18212c; transition: opacity 160ms ease; }
    .story-nav__header { display: grid; grid-template-columns: 1fr auto; gap: 14px 8px; padding: 16px; border-bottom: 1px solid var(--line); }
    .story-nav__title { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .story-nav__title h2 { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
    .story-nav__title > span, .story-nav__count { min-width: 20px; border-radius: 999px; padding: 2px 6px; background: rgb(148 163 184 / 15%); color: var(--muted); font-size: 11px; text-align: center; }
    .story-nav__close { width: 28px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font-size: 24px; line-height: 1; cursor: pointer; }
    .story-nav__close:hover { background: rgb(255 255 255 / 8%); color: var(--text); }
    .story-nav__filter { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; min-width: 0; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; background: rgb(15 23 42 / 45%); }
    .story-nav__filter:focus-within { border-color: var(--accent); }
    .story-nav__filter input { min-width: 0; width: 100%; border: 0; outline: 0; background: transparent; color: var(--text); font: inherit; }
    .story-nav__scroll { min-height: 0; overflow: auto; scrollbar-gutter: stable; padding: 10px 16px 20px; }
    .story-nav__group { margin: 6px 0 14px; }
    .story-nav__group > summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 4px; color: var(--muted); cursor: pointer; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .story-nav__group--changed > summary, .story-nav__group--layout-diff > summary, .story-nav__group--file-not-exists > summary { color: var(--danger); }
    .story-nav__group--passed > summary { color: var(--ok); }
    .story-nav ul { list-style: none; margin: 0; padding: 0; }
    .story-nav__tree ul { margin-left: 10px; padding-left: 10px; border-left: 1px solid #3a4654; }
    .story-nav__tree details > summary { display: flex; align-items: center; gap: 7px; overflow: hidden; padding: 6px 4px; cursor: pointer; color: var(--text); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
    .story-nav__tree details > summary span:last-child { overflow: hidden; text-overflow: ellipsis; }
    .story-nav__tree details > summary:hover { background: rgb(255 255 255 / 5%); }
    .story-nav__story { margin: 2px 0; }
    .story-nav a { display: flex; align-items: center; gap: 8px; overflow: hidden; border-radius: 6px; padding: 6px 5px; color: var(--text); white-space: nowrap; text-decoration: none; }
    .story-nav a span:last-child { overflow: hidden; text-overflow: ellipsis; }
    .story-nav a:hover { background: rgb(255 255 255 / 8%); color: var(--accent); }
    .tree-icon { position: relative; display: inline-block; flex: 0 0 auto; width: 14px; height: 14px; color: #94a3b8; }
    .tree-icon--folder { height: 10px; border-radius: 2px; background: currentColor; }
    .tree-icon--folder::before { content: ""; position: absolute; top: -3px; left: 1px; width: 6px; height: 4px; border-radius: 2px 2px 0 0; background: currentColor; }
    .tree-icon--file { box-sizing: border-box; border: 1.5px solid currentColor; border-radius: 2px; }
    .tree-icon--file::before, .tree-icon--file::after { content: ""; position: absolute; left: 3px; right: 3px; height: 1px; background: currentColor; }
    .tree-icon--file::before { top: 4px; } .tree-icon--file::after { top: 8px; }
    .tree-icon--search { width: 12px; height: 12px; border: 2px solid currentColor; border-radius: 50%; }
    .tree-icon--search::after { content: ""; position: absolute; right: -5px; bottom: -3px; width: 6px; height: 2px; background: currentColor; transform: rotate(45deg); }
    .story-nav__empty { padding: 24px 8px; color: var(--muted); font-size: 13px; text-align: center; }
    .story { background: var(--panel); border: 1px solid var(--line); border-radius: 18px; padding: 20px; margin-top: 18px; box-shadow: 0 18px 50px rgb(0 0 0 / 24%); }
    .story--changed { border-color: rgb(251 113 133 / 70%); }
    .story--layout-diff, .story--file-not-exists { border-color: rgb(251 113 133 / 70%); }
    .story--passed { border-color: rgb(52 211 153 / 45%); }
    .story__header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 18px; }
    .status { display: inline-block; color: var(--bg); background: var(--warn); border-radius: 999px; padding: 3px 9px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 8px; }
    .story--changed .status { background: var(--danger); }
    .story--layout-diff .status, .story--file-not-exists .status { background: var(--danger); }
    .story--passed .status { background: var(--ok); }
    .metrics { display: flex; gap: 12px; margin: 0; }
    .metrics div { min-width: 110px; border: 1px solid var(--line); border-radius: 12px; padding: 10px; }
    dt { color: var(--muted); font-size: 12px; }
    dd { margin: 4px 0 0; font-weight: 700; }
    .inspector-tabs { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 12px; margin: -8px -24px 20px; padding: 10px 24px; border-block: 1px solid var(--line); background: rgb(15 23 42 / 94%); box-shadow: 0 8px 24px rgb(0 0 0 / 18%); backdrop-filter: blur(12px); }
    .inspector-tabs__label, .inspector-tabs__hint { color: var(--muted); font-size: 12px; font-weight: 700; }
    .inspector-tabs__hint { margin-left: auto; font-weight: 500; }
    .inspector-tabs__list { display: inline-flex; padding: 3px; border: 1px solid var(--line); border-radius: 9px; background: #0b1220; }
    .inspector-tabs button { border: 0; border-radius: 6px; padding: 8px 18px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
    .inspector-tabs button:hover { color: var(--text); }
    .inspector-tabs button.is-active { background: #334155; color: #fff; box-shadow: 0 1px 3px rgb(0 0 0 / 35%); }
    .comparison { margin-bottom: 18px; }
    .comparison__frame { position: relative; overflow: hidden; border: 1px solid var(--line); border-radius: 14px; background: #020617; }
    .comparison__image { display: block; width: 100%; height: auto; user-select: none; }
    .comparison__overlay { position: absolute; inset: 0; }
    .comparison__split { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: stretch; }
    .comparison__frame--pane { border: 0; border-radius: 0; }
    /* isolation で difference 合成をこのフレーム内に閉じ込め、brightness で微小差分を持ち上げる。 */
    .comparison__frame--difference { isolation: isolate; background: #000; filter: brightness(3); }
    .comparison__frame--difference .comparison__overlay { mix-blend-mode: difference; }
    .comparison__pane { min-width: 0; margin: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 12px; background: #020617; }
    .comparison__pane figcaption, .comparison__pane--empty strong { display: block; padding: 8px 12px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; font-weight: 700; }
    .comparison__pane--empty { display: grid; min-height: 240px; align-content: start; color: var(--muted); }
    .comparison__pane--empty span { place-self: center; margin-top: 80px; }
    .comparison__unavailable { display: grid; min-height: 420px; place-items: center; border: 1px dashed var(--line); border-radius: 14px; color: var(--muted); background: #020617; }
    .comparison__actual { position: absolute; inset: 0; overflow: hidden; }
    .comparison__handle { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--accent); box-shadow: 0 0 0 9999px rgb(56 189 248 / 0%); }
    .comparison__handle::after { content: ""; position: absolute; top: 50%; left: 50%; width: 28px; height: 28px; border: 2px solid var(--accent); border-radius: 999px; background: var(--panel); transform: translate(-50%, -50%); box-shadow: 0 4px 16px rgb(0 0 0 / 35%); }
    .comparison__control { display: grid; gap: 8px; margin-top: 10px; color: var(--muted); font-size: 13px; }
    input[type="range"] { width: 100%; accent-color: var(--accent); }
    @media (max-width: 900px) { .hero, .story__header { display: block; } .hero__actions { justify-content: flex-start; margin-top: 12px; } .metrics { display: grid; grid-template-columns: 1fr; } }
    @media (max-width: 720px) { .comparison__split { grid-template-columns: 1fr; } }
    @media (max-width: 640px) { .layout, .layout--detail, .layout--nav-hidden { display: block; width: 100%; } main { padding: 12px; } .story-nav { position: static; height: min(70vh, 620px); } .layout--nav-hidden .story-nav { display: none; } .layout--nav-hidden .nav-reveal { position: fixed; top: 0; } .inspector-tabs { overflow-x: auto; margin-inline: -12px; padding-inline: 12px; } .inspector-tabs__label, .inspector-tabs__hint { display: none; } }
  </style>
</head>
<body>
  <div class="layout${options.detailStory ? " layout--detail" : ""}" data-layout>
  ${renderSidebar(summary, options)}
  ${options.detailStory ? "" : '<button class="nav-reveal" type="button" data-nav-toggle aria-label="Show story files" aria-controls="story-navigation" aria-expanded="false">›</button>'}
  <main>
    <section class="hero">
      <div>
        <h1>${options.detailStory ? escapeHtml(options.detailStory) : "Storybook Visual Regression Report"}</h1>
        <p class="summary">${options.detailStory ? '<a href="../" data-back-link>← Back to all stories</a>' : "Switch between Overlay, Split + Diff, and Slider to inspect changes. Click a story title to open its detail page."}</p>
      </div>
      <div class="hero__actions">
        <div class="badge">Failed: <strong>${summary.failed}</strong> / Threshold: ${summary.maxDiffRatio}</div>
      </div>
    </section>
    ${renderInspectorTabs(summary.reportVersion ?? "local")}
    ${summary.results.map((result) => renderStory(result, options)).join("")}
  </main>
  </div>
  <script>
    const layout = document.querySelector("[data-layout]");
    const navToggles = document.querySelectorAll("[data-nav-toggle]");
    if (layout) {
      for (const navToggle of navToggles) navToggle.addEventListener("click", () => {
        const hidden = layout.classList.toggle("layout--nav-hidden");
        for (const toggle of navToggles) toggle.setAttribute("aria-expanded", String(!hidden));
      });
    }
    const storyFilter = document.querySelector("[data-story-filter]");
    if (storyFilter) {
      storyFilter.addEventListener("input", () => {
        const query = storyFilter.value.trim().toLowerCase();
        const leaves = [...document.querySelectorAll("[data-tree-leaf]")];
        for (const leaf of leaves) leaf.hidden = !leaf.dataset.searchText.includes(query);
        for (const node of [...document.querySelectorAll("[data-tree-node]")].reverse()) {
          node.hidden = !node.querySelector("[data-tree-leaf]:not([hidden])");
          if (query && !node.hidden) node.querySelector(":scope > details").open = true;
        }
        for (const group of document.querySelectorAll("[data-status-group]")) {
          group.hidden = !group.querySelector("[data-tree-leaf]:not([hidden])");
          if (query && !group.hidden) group.open = true;
        }
        document.querySelector("[data-filter-empty]").hidden = leaves.some((leaf) => !leaf.hidden);
      });
    }
    const currentDirectory = () => window.location.pathname.endsWith("/") ? window.location.pathname : window.location.pathname + "/";
    for (const link of document.querySelectorAll("[data-story-link]")) {
      const story = link.getAttribute("data-story-link");
      if (story) {
        link.href = currentDirectory() + encodeURIComponent(story) + "/";
      }
    }
    for (const link of document.querySelectorAll("[data-back-link]")) {
      const path = window.location.pathname.endsWith("/") ? window.location.pathname.slice(0, -1) : window.location.pathname;
      link.href = path.slice(0, path.lastIndexOf("/")) + "/";
    }
    const inspectorTabs = document.querySelectorAll("[data-global-view-mode]");
    const setViewMode = (mode) => {
      for (const tab of inspectorTabs) {
        const active = tab.dataset.globalViewMode === mode;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
      }
      for (const root of document.querySelectorAll("[data-comparison]")) {
        for (const view of root.querySelectorAll("[data-view]")) view.hidden = view.dataset.view !== mode;
      }
    };
    for (const tab of inspectorTabs) tab.addEventListener("click", () => setViewMode(tab.dataset.globalViewMode));
    for (const root of document.querySelectorAll("[data-comparison]")) {
      for (const overlay of root.querySelectorAll("[data-overlay]")) {
        const overlaySlider = overlay.querySelector("[data-overlay-slider]");
        const overlayImage = overlay.querySelector("[data-overlay-image]");
        if (overlaySlider && overlayImage) overlaySlider.addEventListener("input", () => {
          overlayImage.style.opacity = String(Number(overlaySlider.value) / 100);
        });
      }
      const slider = root.querySelector("[data-slider]");
      const actual = root.querySelector("[data-actual]");
      const handle = root.querySelector("[data-handle]");
      if (slider && actual && handle) {
        const update = () => {
          const value = slider.value;
          actual.style.clipPath = "inset(0 0 0 " + value + "%)";
          handle.style.left = value + "%";
        };
        slider.addEventListener("input", update);
        update();
      }
    }
  </script>
</body>
</html>`;

const { command, options } = parseArgs();
if (command === "capture") {
  await capture(options);
} else if (command === "compare") {
  await compare(options);
} else {
  throw new Error("Usage: storybook-visual-regression.mjs <capture|compare> [--key value]");
}
