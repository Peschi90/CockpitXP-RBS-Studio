import { describe, expect, it } from "vitest";
import { fieldSample, fontRequest } from "../src/core/text-layout";
import { geometry, geometryAttributes, parseRbs } from "../src/core/xml";
describe("Cockpit field layout", () => {
  it("reads and preserves the German links coordinate used by Cockpit symbols", () => {
    const doc = parseRbs(
      '<RennScreen><base><dim xmax="1912" ymax="1008"/></base><variablen><symbole_einaus links="1544" top="345" breite="48" hoehe="48"/></variablen></RennScreen>',
    );
    const node = doc.elements[0]!;
    expect(geometry(node)).toMatchObject({
      x: 1544,
      y: 345,
      width: 48,
      height: 48,
    });
    expect(geometryAttributes(node, { x: 1550, y: 350 })).toEqual({
      links: 1550,
      top: 350,
      breite: 48,
      hoehe: 48,
    });
  });
  it("keeps numeric and time masks stable even when len contains unrelated values", () => {
    const doc = parseRbs(
      '<RennScreen><base><dim xmax="1920" ymax="1080"/></base><variablen><rennzeit len="17">0:00:00,0</rennzeit><runde len="8">9999</runde></variablen></RennScreen>',
    );
    expect(doc.elements.map((n) => fieldSample(n, n.attrs))).toEqual([
      "0:00:00,0",
      "9999",
    ]);
  });
  it("preserves signed VCL height and applies the document factor exactly once", () => {
    expect(
      fontRequest({ fh: "96", ft: "Arial", fs: "bi" }, "100", "9999"),
    ).toEqual({
      family: "Arial",
      height: 96,
      bold: true,
      italic: true,
      text: "9999",
    });
    expect(fontRequest({ fh: "-40" }, "75", "x").height).toBe(-30);
  });
  it("moving an intrinsic bitmap does not silently add guessed dimensions", () => {
    const doc = parseRbs(
      '<RennScreen><base><dim xmax="1920" ymax="1080"/></base><grafik><bitmap x1="10" y1="20" file="logo.bmp"/></grafik></RennScreen>',
    );
    expect(geometryAttributes(doc.elements[0]!, { x: 30, y: 40 })).toEqual({
      x1: 30,
      y1: 40,
    });
  });
});
