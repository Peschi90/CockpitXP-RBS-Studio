import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  parseRbs,
  setAttributes,
  setText,
  geometry,
  geometryAttributes,
  insertXml,
  deleteNodes,
  fromCssColor,
  toCssColor,
} from "../src/core/xml";
import { createTemplate } from "../src/core/templates";
import {
  createSimulation,
  tick,
  displayText,
  resetSimulation,
} from "../src/core/simulator";
const xml = `<?xml version="1.0" encoding="iso-8859-1"?>\r\n<!-- Grüße > untouched -->\r\n<RennScreen custom='yes'><base><dim xmax="1920" ymax="1080"/><defaults ft="Arial"/></base><grafik><box x1='10' y1='20' x2='110' y2='80' c="000000FF" mystery="a &gt; b"/></grafik><texte><text left="20" top="30" text="Grüße &amp; Hallo"/></texte><variablen><custom nr="1" left="50" top="70" strange="preserve"><child q="&quot;"/></custom><fahrer left="100" top="200">Müller</fahrer></variablen></RennScreen>`;
describe("Source-preserving RBS edits", () => {
  it("retains the complete input when unchanged", () =>
    expect(parseRbs(xml).source).toBe(xml));
  it("changes only the requested attribute, keeping quote style, comments, unknown data and CRLF", () => {
    const d = parseRbs(xml);
    const n = d.elements.find((n) => n.tag === "box")!;
    expect(setAttributes(d, [{ node: n, attrs: { x1: 14 } }])).toBe(
      xml.replace("x1='10'", "x1='14'"),
    );
  });
  it("moves old endpoint graphics without resizing them", () => {
    const d = parseRbs(xml);
    const n = d.elements.find((n) => n.tag === "box")!;
    const moved = parseRbs(
      setAttributes(d, [
        { node: n, attrs: geometryAttributes(n, { x: 40, y: 60 }) },
      ]),
    );
    expect(
      geometry(moved.elements.find((n) => n.tag === "box")!),
    ).toMatchObject({ x: 40, y: 60, width: 100, height: 60 });
  });
  it("preserves nested unknown XML when editing other elements", () => {
    const d = parseRbs(xml);
    const changed = setText(
      d,
      d.elements.find((n) => n.tag === "fahrer")!,
      "Müller & Sohn <1>",
    );
    expect(changed).toContain(
      '<custom nr="1" left="50" top="70" strange="preserve"><child q="&quot;"/></custom>',
    );
    expect(
      parseRbs(changed).elements.find((n) => n.tag === "fahrer")!.text,
    ).toBe("Müller & Sohn <1>");
  });
  it("escapes both quote types and markup in attributes", () => {
    const d = parseRbs(xml);
    const n = d.elements.find((n) => n.tag === "text")!;
    const changed = parseRbs(setText(d, n, `It's "<fast>" & safe`));
    expect(changed.elements.find((n) => n.tag === "text")!.attrs.text).toBe(
      `It's "<fast>" & safe`,
    );
  });
  it("does not confuse attribute-like text with real attributes", () => {
    const source = xml.replace(
      'text="Grüße &amp; Hallo"',
      `text=" left='40' "`,
    );
    const d = parseRbs(source);
    const n = d.elements.find((n) => n.tag === "text")!;
    const changed = setAttributes(d, [{ node: n, attrs: { left: 90 } }]);
    expect(changed).toContain(`text=" left='40' "`);
    expect(parseRbs(changed).nodes[n.id]!.attrs.left).toBe("90");
  });
  it("adds to empty self-closing sections and removes only selected nodes", () => {
    const d = parseRbs(
      '<RennScreen><base><framepos w="800" h="600"/></base><texte/></RennScreen>',
    );
    const a = parseRbs(insertXml(d, "texte", '<text text="Test"/>'));
    expect(a.elements).toHaveLength(1);
    expect(parseRbs(deleteNodes(a, [a.elements[0]!.id])).elements).toHaveLength(
      0,
    );
  });
  it("rejects malformed XML and external entities", () => {
    expect(() => parseRbs(xml.replace("</RennScreen>", ""))).toThrow();
    expect(() =>
      parseRbs('<!DOCTYPE RennScreen SYSTEM "file:///test">' + xml),
    ).toThrow();
    expect(() => parseRbs(xml.replace('xmax="1920"', 'xmax="0"'))).toThrow();
  });
  it("converts Delphi BGR colors correctly", () => {
    expect(toCssColor("000000FF")).toBe("#FF0000");
    expect(fromCssColor("#b9e66b")).toBe("006BE6B9");
    expect(toCssColor("slotcolorbg", 2)).toBe("#55a9f5");
  });
  it.each([1, 2, 4, 6, 8])("creates editable %s-driver templates", (slots) => {
    const d = parseRbs(createTemplate("race", 1920, 1080, slots));
    expect(d.slots).toBe(slots);
    expect(d.elements.filter((n) => n.tag === "fahrer")).toHaveLength(slots);
  });
});
describe("Race simulation", () => {
  it("stops time during chaos and supports pit refueling", () => {
    const s = createSimulation();
    s.running = true;
    tick(s, 10);
    expect(s.elapsed).toBe(10);
    expect(s.drivers[0]!.laps).toBeGreaterThan(0);
    s.phase = "chaos";
    tick(s, 10);
    expect(s.elapsed).toBe(10);
    s.phase = "race";
    s.drivers[0]!.pit = true;
    s.drivers[0]!.fuel = 50;
    const laps = s.drivers[0]!.laps;
    tick(s, 2);
    expect(s.drivers[0]!.fuel).toBe(66);
    expect(s.drivers[0]!.laps).toBe(laps);
    resetSimulation(s);
    expect(s.running).toBe(false);
    expect(s.drivers[0]!.fuel).toBe(100);
  });
  it("never modifies XML when applying AddOn simulation overrides", () => {
    const source = createTemplate("blank");
    const d = parseRbs(
      insertXml(
        parseRbs(source),
        "variablen",
        '<addonVariable addonvariablename="Test">Original</addonVariable>',
      ),
    );
    const s = createSimulation();
    s.overrides.Test = "Simulated";
    expect(displayText(d.elements[0]!, s)).toBe("Simulated");
    expect(d.source).toContain(">Original</addonVariable>");
  });
});
const root =
  process.env.RBS_TEST_ROOT || "C:/ProgramData/Cockpit-V2/RennBildschirm";
function collect(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? collect(path.join(dir, e.name))
        : e.name.endsWith(".xml")
          ? [path.join(dir, e.name)]
          : [],
    );
}
describe.skipIf(!fs.existsSync(root))(
  "Installed Cockpit-XP library (read-only)",
  () => {
    const files = fs.existsSync(root) ? collect(root) : [];
    for (const file of files) {
      const bytes = fs.readFileSync(file);
      const s = bytes.toString("ascii", 0, 160).match(/iso-8859-1/i)
        ? bytes.toString("latin1")
        : bytes.toString("utf8");
      if (!s.includes("<RennScreen")) continue;
      it(path.relative(root, file), () => {
        const d = parseRbs(s);
        expect(d.source).toBe(s);
        if (!d.elements.length) return;
        const n = d.elements.find(
          (n) => "left" in n.attrs || "xpos" in n.attrs || "x1" in n.attrs,
        );
        if (!n) return;
        const key =
          "left" in n.attrs ? "left" : "xpos" in n.attrs ? "xpos" : "x1";
        const changed = setAttributes(d, [
          { node: n, attrs: { [key]: Number(n.attrs[key]) + 1 } },
        ]);
        const parsed = parseRbs(changed);
        expect(parsed.elements).toHaveLength(d.elements.length);
        const restored = setAttributes(parsed, [
          { node: parsed.nodes[n.id]!, attrs: { [key]: n.attrs[key]! } },
        ]);
        expect(restored).toBe(s);
      });
    }
  },
);
