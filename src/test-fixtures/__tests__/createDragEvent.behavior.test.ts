import { expect, test } from "vitest";
import { createDragEvent } from "../createDragEvent";

test("createDragEvent('dragstart') の type が 'dragstart'", () => {
  const event = createDragEvent("dragstart");
  expect(event.type).toBe("dragstart");
});

test("setData した値が getData で読める", () => {
  const event = createDragEvent("dragstart");
  event.dataTransfer.setData("application/x-spec-board-task", "tasks/a.md");
  expect(event.dataTransfer.getData("application/x-spec-board-task")).toBe(
    "tasks/a.md",
  );
});

test("options を省略しても DataTransfer が注入される", () => {
  const event = createDragEvent("dragover");
  expect(event.dataTransfer).toBeInstanceOf(DataTransfer);
  expect(event.clientX).toBe(0);
  expect(event.clientY).toBe(0);
});

test("clientX / clientY を渡せる", () => {
  const event = createDragEvent("dragover", { clientX: 12, clientY: 34 });
  expect(event.clientX).toBe(12);
  expect(event.clientY).toBe(34);
});
