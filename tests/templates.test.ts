import { expect, it } from "vitest";
import { templates, createTemplate } from "../src/core/templates";
import { parseRbs, geometry, setAttributes } from "../src/core/xml";
it("offers twelve distinct designed layouts plus a blank document", () => {
  expect(templates.filter((t) => t.id !== "blank")).toHaveLength(12);
  expect(new Set(templates.map((t) => t.id)).size).toBe(templates.length);
  // Exclude labels/colours: designs differ in their actual field arrangement.
  const structures = templates.map((t) =>
    parseRbs(createTemplate(t.id))
      .elements.filter((n) => n.attrs.nr && n.attrs.nr !== "0")
      .map((n) => `${n.tag}:${n.attrs.nr}:${n.attrs.left}:${n.attrs.top}`)
      .join("|"),
  );
  expect(new Set(structures).size).toBe(templates.length);
});
for (const t of templates) {
  it(`${t.name}: valid editable RBS for 1–8 drivers in HD, Full HD, QHD, 4K and 4:3`, () => {
    for (const slots of [1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const [width, height] of [
        [1280, 720],
        [1920, 1080],
        [2560, 1440],
        [3840, 2160],
        [1024, 768],
      ]) {
        const doc = parseRbs(createTemplate(t.id, width, height, slots));
        expect(doc.slots).toBe(slots);
        expect(doc.width).toBe(width);
        expect(doc.height).toBe(height);
        const driverIds = [
          ...new Set(
            doc.elements.map((n) => Number(n.attrs.nr)).filter((n) => n > 0),
          ),
        ].sort();
        expect(driverIds).toEqual(
          t.id === "blank"
            ? []
            : Array.from({ length: slots }, (_, i) => i + 1),
        );
        for (const n of doc.elements) {
          const g = geometry(n);
          expect(g.x).toBeGreaterThanOrEqual(0);
          expect(g.y).toBeGreaterThanOrEqual(0);
          expect(g.x).toBeLessThan(width!);
          expect(g.y).toBeLessThan(height!);
          if (g.sized) {
            expect(g.x + g.width).toBeLessThanOrEqual(width!);
            expect(g.y + g.height).toBeLessThanOrEqual(height!);
          }
        }
        const editable = doc.elements.find(
          (n) => n.tag === "fahrer" || n.tag === "fahrersn",
        );
        if (editable) {
          const saved = parseRbs(
            setAttributes(doc, [{ node: editable, attrs: { left: 55 } }]),
          );
          expect(
            saved.elements.find((n) => n.id === editable.id)?.attrs.left,
          ).toBe("55");
        }
      }
    }
  });
}
