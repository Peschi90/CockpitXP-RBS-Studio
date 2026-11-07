import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { useEditor } from "../src/core/editor";
import { geometry } from "../src/core/xml";
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
const source =
  '<RennScreen><base><dim xmax="1920" ymax="1080"/></base><grafik><box x1="20" y1="30" x2="80" y2="90"/><box left="200" top="300" breite="70" hoehe="80"/><box left="400" top="500" breite="90" hoehe="100"/></grafik></RennScreen>';
it("aligns to first selection, independently of XML order and minimum position; one undo restores all", () => {
  const e = useEditor();
  e.commit(source);
  const nodes = e.doc.value.elements;
  e.selected.value = [nodes[1]!.id, nodes[2]!.id, nodes[0]!.id];
  e.align("top");
  expect(e.doc.value.elements.map((n) => geometry(n))).toMatchObject([
    { x: 20, y: 300, width: 60, height: 60 },
    { x: 200, y: 300, width: 70, height: 80 },
    { x: 400, y: 300, width: 90, height: 100 },
  ]);
  expect(e.selected.value[0]).toBe(nodes[1]!.id);
  e.undo();
  expect(e.source.value).toBe(source);
  e.selected.value = [nodes[2]!.id, nodes[0]!.id, nodes[1]!.id];
  e.align("left");
  expect(e.doc.value.elements.map((n) => geometry(n))).toMatchObject([
    { x: 400, y: 30, width: 60, height: 60 },
    { x: 400, y: 300, width: 70, height: 80 },
    { x: 400, y: 500, width: 90, height: 100 },
  ]);
});
