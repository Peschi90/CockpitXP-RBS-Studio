import { expect, it } from "vitest";
import {
  templates,
  createTemplate,
  filterTemplates,
  supportsDrivers,
} from "../src/core/templates";
import { friendlyTemplates } from "../src/core/friendly-templates";
import { parseRbs, geometry, setAttributes } from "../src/core/xml";
it("offers twenty-four distinct designed layouts plus a blank document", () => {
  expect(templates.filter((t) => t.id !== "blank")).toHaveLength(24);
  expect(new Set(templates.map((t) => t.id)).size).toBe(templates.length);
  // Exclude labels/colours: designs differ in their actual field arrangement.
  const structures = templates.map((t) =>
    parseRbs(createTemplate(t.id, 1920, 1080, Math.min(6, t.maxDrivers)))
      .elements.filter((n) => n.attrs.nr && n.attrs.nr !== "0")
      .map((n) => `${n.tag}:${n.attrs.nr}:${n.attrs.left}:${n.attrs.top}`)
      .join("|"),
  );
  expect(new Set(structures).size).toBe(templates.length);
});
for (const t of templates) {
  it(`${t.name}: valid editable RBS for supported driver counts in HD, Full HD, QHD, 4K and 4:3`, () => {
    for (const slots of [1, 2, 3, 4, 5, 6, 7, 8]) {
      if (!supportsDrivers(t, slots)) {
        expect(() => createTemplate(t.id, 1920, 1080, slots)).toThrow(/Fahrer/);
        continue;
      }
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

it("combines driver count, arrangement and light/dark filters", () => {
  expect(filterTemplates(2, "horizontal", "light").map((t) => t.id)).toEqual([
    "lemon",
    "paper",
    "pistachio",
    "podium",
  ]);
  expect(filterTemplates(6, "horizontal", "light").map((t) => t.id)).toEqual([
    "paper",
  ]);
  expect(filterTemplates(8, "horizontal", "light")).toEqual([]);
  expect(filterTemplates(8, "horizontal", "dark").map((t) => t.id)).toEqual([
    "pitwall",
  ]);
  expect(filterTemplates(8, "vertical", "light").map((t) => t.id)).toEqual([
    "light",
    "polar",
    "sunshine",
    "meadow",
    "apricot",
    "garden",
  ]);
  expect(filterTemplates(8, "grid", "light").map((t) => t.id)).toEqual([
    "mint",
    "lagoon",
    "gridline",
  ]);
  expect(filterTemplates(1).some((t) => t.id === "blank")).toBe(true);
  expect(filterTemplates(1).some((t) => t.id === "lemon")).toBe(false);
});

it("uses editable rounded shapes and the advertised driver arrangement", () => {
  for (const t of friendlyTemplates) {
    const doc = parseRbs(createTemplate(t.id, 1920, 1080, t.maxDrivers));
    expect(doc.elements.some((n) => n.tag === "roundbox")).toBe(t.rounded);
    const names = doc.elements.filter((n) => n.tag === "fahrer").map(geometry);
    expect(names).toHaveLength(t.maxDrivers);
    if (t.arrangement === "horizontal")
      expect(new Set(names.map((n) => n.y)).size).toBe(1);
    if (t.arrangement === "vertical")
      expect(new Set(names.map((n) => n.x)).size).toBe(1);
    if (t.arrangement === "grid") {
      expect(new Set(names.map((n) => n.y)).size).toBeGreaterThan(1);
      expect(new Set(names.map((n) => n.x)).size).toBeGreaterThan(1);
    }
  }
});
