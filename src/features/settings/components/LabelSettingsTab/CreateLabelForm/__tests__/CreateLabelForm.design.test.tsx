import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { LabelDraft } from "@/domains/label-definition";
import { CreateLabelForm } from "..";

test("フォームはdark対応tokenとcustom group listbox triggerを使う", () => {
  const values = {
    name: "needs-design",
    description: "",
    group: "status",
    color: "#7860b5",
  };
  const html = renderToStaticMarkup(
    createElement(CreateLabelForm, {
      values,
      editingName: null,
      isPending: false,
      validation: LabelDraft.validate(values, [], null),
      groupOptions: ["status", "type"],
      onChange: vi.fn(),
      onReset: vi.fn(),
      onSubmit: vi.fn(),
    }),
  );
  expect(html).not.toContain("bg-white");
  expect(html).not.toContain("border-slate");
  expect(html).toContain('aria-haspopup="listbox"');
});
