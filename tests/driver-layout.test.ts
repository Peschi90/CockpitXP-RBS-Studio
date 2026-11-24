// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import {
  driverArea,
  driverElements,
  resizeDrivers,
  suggestDriverGroups,
} from "../src/core/driver-layout";
import { gridColumns } from "../src/core/runtime";
import { geometry, parseRbs } from "../src/core/xml";

vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
  // Supply deterministic metrics for layout in JSDOM.
  return {
    font: "1000px Arial",
    measureText(this: { font: string }, text: string) {
      const size = Number(this.font.match(/\d+(?=px)/)?.[0]);
      return {
        width: (text.length * size) / 2,
        fontBoundingBoxAscent: size * 0.8,
        fontBoundingBoxDescent: size * 0.2,
      };
    },
  } as CanvasRenderingContext2D;
});

const source = `<RennScreen>
  <base><dim xmax="600" ymax="400" slots="2"/></base>
  <grafik>
    <!-- common frame -->
    <box left="0" top="0" breite="600" hoehe="400"/>
    <box left="20" top="20" breite="260" hoehe="75"/>
    <box left="20" top="105" breite="260" hoehe="75"/>
  </grafik>
  <texte>
    <text left="300" top="15" text="2 FAHRER / COCKPIT-XP"/>
    <text left="25" top="25" fh="16" text="Spur 1"/>
    <text left="25" top="110" fh="16" text="Spur 2"/>
  </texte>
  <variablen>
    <addonVariable nr="1" addonvariablename="Sensor1Lane01" left="100" top="25" fh="18">00</addonVariable>
    <addonVariable nr="2" addonvariablename="Sensor1Lane02" left="100" top="110" fh="18">00</addonVariable>
    <datagrid nr="1" eft="1" left="25" top="45" breite="250" hoehe="45">Laps</datagrid>
    <datagrid nr="1" variable="runde" len="40">Runde</datagrid>
    <datagrid nr="2" eft="2" left="25" top="130" breite="250" hoehe="45">Laps</datagrid>
    <datagrid nr="2" variable="runde" len="40">Runde</datagrid>
  </variablen>
</RennScreen>`;

test("reflows a whole screen and preserves the driver bindings and grid columns", () => {
  const doc = parseRbs(source);
  const elements = driverElements(doc);
  const groups = suggestDriverGroups(elements, doc.slots, 1, []);
  const area = {
    ...driverArea(elements, 1, groups),
    fill: "screen" as const,
    columns: 2,
    margin: 10,
    gapX: 20,
    gapY: 30,
  };
  const result = resizeDrivers(doc, elements, [area], 3);
  const changed = parseRbs(result.source);
  expect(changed.slots).toBe(3);
  expect(result.cells[0]).toEqual([
    { x: 10, y: 10, width: 280, height: 175 },
    { x: 310, y: 10, width: 280, height: 175 },
    { x: 10, y: 215, width: 580, height: 175 },
  ]);
  expect(result.source).toContain("<!-- common frame -->");
  expect(result.source).toContain('text="3 FAHRER / COCKPIT-XP"');
  expect(result.source).toContain('text="Spur 3"');
  expect(
    changed.elements
      .filter((n) => n.tag === "box")
      .map((n) => geometry(n).width),
  ).toEqual([600, 280, 580, 280]);
  expect(
    changed.elements.find(
      (n) => n.attrs.nr === "3" && n.tag === "addonVariable",
    )?.attrs.addonvariablename,
  ).toBe("Sensor1Lane03");
  const grid = changed.elements.find(
    (n) => n.attrs.nr === "3" && n.tag === "datagrid" && !n.attrs.variable,
  )!;
  expect(gridColumns(grid, changed.elements).map((n) => n.attrs.nr)).toEqual([
    "3",
  ]);
});

test("reducing with a higher-numbered reference preserves the retained driver's original configuration", () => {
  const doc = parseRbs(source);
  const elements = driverElements(doc);
  const groups = suggestDriverGroups(elements, doc.slots, 2, []);
  const result = resizeDrivers(
    doc,
    elements,
    [driverArea(elements, 2, groups)],
    1,
  );
  const changed = parseRbs(result.source);
  expect(
    changed.elements.some(
      (n) => n.attrs.nr === "2" || n.attrs.text === "Spur 2",
    ),
  ).toBe(false);
  expect(
    changed.elements.find((n) => n.tag === "datagrid" && !n.attrs.variable)
      ?.attrs.eft,
  ).toBe("1");
  expect(result.unassigned).toBe(0);
});
