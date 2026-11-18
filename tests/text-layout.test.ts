import { describe, expect, it } from "vitest";
import {
  fieldSample,
  fontRequest,
  textFieldSize,
  textReserveLength,
} from "../src/core/text-layout";
import { geometry, geometryAttributes, parseRbs } from "../src/core/xml";
describe("Cockpit field layout", () => {
  it("reserves string length even with a saved preview caption and includes affixes", () => {
    const doc = parseRbs(
      '<RennScreen><base><dim xmax="1920" ymax="1080"/></base><variablen><fahrer len="20">Fahrername</fahrer><status len="12" prefix="Status: " post="!">status</status><addonVariable len="15">0</addonVariable></variablen></RennScreen>',
    );
    expect(doc.elements.map((n) => fieldSample(n, n.attrs))).toEqual([
      "W".repeat(20),
      "Status: " + "W".repeat(12) + "!",
      "W".repeat(15),
    ]);
    const n = doc.elements[0]!;
    expect(fieldSample(n, { ...n.attrs, len: "3" })).toBe("WWW");
    for (const len of ["0", "-5", "NaN", "Infinity"])
      expect(fieldSample(n, { ...n.attrs, len })).toBe("Fahrername");
    expect(textReserveLength(n, { len: "100000" })).toBe(10000);
    expect(textReserveLength(n, { len: "4.8" })).toBe(4);
    expect(n.text).toBe("Fahrername");
  });
  it("uses the reserve for explicit-width text fields and restores fixed width at zero", () => {
    const doc = parseRbs(
      '<RennScreen><base><dim xmax="1920" ymax="1080"/></base><variablen><fahrer left="50" top="60" breite="120" hoehe="36" len="20">Fahrername</fahrer></variablen></RennScreen>',
    );
    const n = doc.elements[0]!;
    const metrics = {
      family: "Arial",
      emSize: 31,
      height: 36,
      baseline: 29,
      width: 400,
    };
    expect(textFieldSize(n, n.attrs, metrics)).toEqual({
      width: 400,
      height: 36,
    });
    expect(
      textFieldSize(n, { ...n.attrs, len: "2" }, { ...metrics, width: 40 }),
    ).toEqual({ width: 40, height: 36 });
    expect(textFieldSize(n, { ...n.attrs, len: "0" }, metrics)).toEqual({
      width: 120,
      height: 36,
    });
  });
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
