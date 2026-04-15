import type { ReactNode } from "react";

type MarkdownBodyProps = {
	body: string;
};

/**
 * @param text - インライン装飾を含むテキスト
 * @returns ReactNode の配列
 */
function renderInline(text: string): ReactNode[] {
	const result: ReactNode[] = [];
	const regex = /(`[^`]+`|\*\*(.+?)\*\*)/g;
	let lastIndex = 0;
	let key = 0;

	for (const match of text.matchAll(regex)) {
		const idx = match.index;
		if (idx > lastIndex) {
			result.push(text.slice(lastIndex, idx));
		}
		if (match[0].startsWith("`")) {
			result.push(<code key={key++}>{match[0].slice(1, -1)}</code>);
		} else {
			result.push(<strong key={key++}>{match[2]}</strong>);
		}
		lastIndex = idx + match[0].length;
	}
	if (lastIndex < text.length) {
		result.push(text.slice(lastIndex));
	}
	return result;
}

/**
 * @param props - {@link MarkdownBodyProps}
 * @returns Markdown をレンダリングした要素、body が空なら null
 */
export function MarkdownBody({ body }: MarkdownBodyProps) {
	if (!body) return null;

	const lines = body.split("\n");
	const elements: ReactNode[] = [];
	let key = 0;
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (line.startsWith("```")) {
			const codeLines: string[] = [];
			i++;
			while (i < lines.length && !lines[i].startsWith("```")) {
				codeLines.push(lines[i]);
				i++;
			}
			if (i < lines.length) i++;
			elements.push(
				<pre key={key++}>
					<code>{codeLines.join("\n")}</code>
				</pre>,
			);
			continue;
		}

		if (line.trim() === "") {
			i++;
			continue;
		}

		const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
		if (headingMatch) {
			const level = headingMatch[1].length;
			const content = renderInline(headingMatch[2]);
			if (level === 1) elements.push(<h1 key={key++}>{content}</h1>);
			else if (level === 2) elements.push(<h2 key={key++}>{content}</h2>);
			else elements.push(<h3 key={key++}>{content}</h3>);
			i++;
			continue;
		}

		if (/^[-*]\s+/.test(line)) {
			const items: ReactNode[] = [];
			while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
				const itemText = lines[i].replace(/^[-*]\s+/, "");
				items.push(<li key={items.length}>{renderInline(itemText)}</li>);
				i++;
			}
			elements.push(<ul key={key++}>{items}</ul>);
			continue;
		}

		const paraLines: string[] = [];
		while (
			i < lines.length &&
			lines[i].trim() !== "" &&
			!lines[i].startsWith("```") &&
			!/^#{1,3}\s+/.test(lines[i]) &&
			!/^[-*]\s+/.test(lines[i])
		) {
			paraLines.push(lines[i]);
			i++;
		}
		if (paraLines.length > 0) {
			elements.push(<p key={key++}>{renderInline(paraLines.join(" "))}</p>);
		}
	}

	return <div data-testid="markdown-body">{elements}</div>;
}
