import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { MarkdownBody } from "./MarkdownBody";

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
 * @param body - レンダリングする Markdown 文字列
 */
function render(body: string) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(createElement(MarkdownBody, { body }));
	});
}

test("# 見出しがh1タグでレンダリングされる", () => {
	render("# 見出し");
	const h1 = document.querySelector("h1");
	expect(h1).toBeTruthy();
	expect(h1?.textContent).toBe("見出し");
});

test("## 見出しがh2タグでレンダリングされる", () => {
	render("## 見出し2");
	const h2 = document.querySelector("h2");
	expect(h2).toBeTruthy();
	expect(h2?.textContent).toBe("見出し2");
});

test("### 見出しがh3タグでレンダリングされる", () => {
	render("### 見出し3");
	const h3 = document.querySelector("h3");
	expect(h3).toBeTruthy();
	expect(h3?.textContent).toBe("見出し3");
});

test("- リスト項目がliタグでレンダリングされる", () => {
	render("- リスト項目");
	const li = document.querySelector("li");
	expect(li).toBeTruthy();
	expect(li?.textContent).toBe("リスト項目");
});

test("* リスト項目がliタグでレンダリングされる", () => {
	render("* リスト項目");
	const li = document.querySelector("li");
	expect(li).toBeTruthy();
	expect(li?.textContent).toBe("リスト項目");
});

test("**太字**がstrongタグでレンダリングされる", () => {
	render("**太字**");
	const strong = document.querySelector("strong");
	expect(strong).toBeTruthy();
	expect(strong?.textContent).toBe("太字");
});

test("`コード`がcodeタグでレンダリングされる", () => {
	render("`コード`");
	const code = document.querySelector("code");
	expect(code).toBeTruthy();
	expect(code?.textContent).toBe("コード");
});

test("コードブロックがpre > codeでレンダリングされる", () => {
	render("```\nconst x = 1;\n```");
	const pre = document.querySelector("pre");
	const code = pre?.querySelector("code");
	expect(pre).toBeTruthy();
	expect(code).toBeTruthy();
	expect(code?.textContent).toBe("const x = 1;");
});

test("<script>がエスケープされる", () => {
	render('<script>alert("xss")</script>');
	expect(container?.querySelector("script")).toBeNull();
	expect(container?.textContent).toContain("alert");
});

test("bodyが空文字の場合、何も表示されない", () => {
	render("");
	const markdownBody = document.querySelector('[data-testid="markdown-body"]');
	expect(markdownBody).toBeNull();
});

test("連続する空行が1つの段落区切りとして扱われる", () => {
	render("段落1\n\n\n\n段落2");
	const paragraphs = document.querySelectorAll("p");
	expect(paragraphs.length).toBe(2);
	expect(paragraphs[0]?.textContent).toBe("段落1");
	expect(paragraphs[1]?.textContent).toBe("段落2");
});
