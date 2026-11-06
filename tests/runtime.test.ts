import { it, expect } from "vitest";
import {
  createSimulation,
  tick,
  resetSimulation,
  driverFor,
} from "../src/core/simulator";
import {
  parseRbs,
  insertXml,
  systemPalette,
  toCssColor,
} from "../src/core/xml";
import { createTemplate } from "../src/core/templates";
import {
  barPercent,
  fireEvent,
  symbolVisible,
  gridColumns,
  gridCell,
} from "../src/core/runtime";
function nodes(xml: string) {
  return parseRbs(
    insertXml(parseRbs(createTemplate("blank")), "variablen", xml),
  ).elements;
}
it("routes on/off symbol events only to the addressed driver", () => {
  const ns = nodes(
    '<symbole_einaus nr="2" audioid_ein="20" audioid_aus="21"/>',
  );
  const s = createSimulation();
  fireEvent(s, ns, 1, 20);
  expect(symbolVisible(ns[0]!, s)).toBe(false);
  fireEvent(s, ns, 2, 20);
  expect(symbolVisible(ns[0]!, s)).toBe(true);
  fireEvent(s, ns, 2, 21);
  expect(symbolVisible(ns[0]!, s)).toBe(false);
});
it("keeps independent progress, countdown, penalty and tank values", () => {
  const ns = nodes(
    '<tankbar nr="1"/><progressbar nr="0" typ="rennzeit"/><progressbar nr="1" typ="strafe"/><progressbar nr="1" typ="AddonBar" addonvariablename="Test"/>',
  );
  const s = createSimulation();
  s.elapsed = 300;
  s.drivers[0]!.penalty = 15;
  s.barValues["Test:1"] = 125;
  expect(ns.map((n) => barPercent(n, s))).toEqual([100, 50, 50, 100]);
});
it("records real completed simulation laps and separates DataGrid columns", () => {
  const ns = nodes(
    '<datagrid nr="1" x1="0" y1="0" x2="400" y2="200"/><datagrid nr="1" variable="runde"/><datagrid nr="1" variable="rundenzeit"/><datagrid nr="2" x1="0" y1="0" x2="400" y2="200"/><datagrid nr="2" variable="tankinhalt"/>',
  );
  expect(gridColumns(ns[0]!, ns)).toHaveLength(2);
  const s = createSimulation();
  s.running = true;
  tick(s, 30);
  expect(s.drivers[0]!.history.length).toBe(s.drivers[0]!.laps);
  expect(gridCell("runde", s.drivers[0]!.history[0]!)).toBe("1");
  resetSimulation(s);
  expect(s.drivers[0]!.history).toHaveLength(0);
});
it("does not advance live snapshots with the local simulation clock", () => {
  const s = createSimulation();
  s.live = true;
  s.running = true;
  tick(s, 10);
  expect(s.elapsed).toBe(0);
  s.drivers[2]!.position = 1;
  expect(driverFor(nodes('<fahrer nr="-1"/>')[0]!, s).id).toBe(3);
});
it("maps Delphi system colors from the Windows palette", () => {
  systemPalette.value[5] = "#123456";
  expect(toCssColor("80000005")).toBe("#123456");
  systemPalette.value = [];
});

it("normalizes live values, preserves missing fields and records only observed laps", async () => {
  const { applySnapshot } = await import("../src/core/live");
  const s = createSimulation();
  s.live = true;
  const data = {
    status: { rennzeit: 12345, rennstatus: 2 },
    drivers: [
      {
        slot: 1,
        runde: 2,
        rundenzeit: 8123,
        schnellsterunde: 8000,
        tankstand: "87,5",
        position: 2,
      },
    ],
    profiles: [{ slot: 1, namefahrer: "Müller" }],
    settings: { sollzeit: 900, sollrennrunden: 80 },
  };
  applySnapshot(s, data);
  applySnapshot(s, data);
  expect(s.elapsed).toBe(12.345);
  expect(s.liveStatus).toBe("STARTAMPEL");
  expect(s.duration).toBe(900);
  expect(s.drivers[0]!.fuel).toBe(87.5);
  expect(s.drivers[0]!.last).toBe(8.123);
  expect(s.drivers[0]!.history).toHaveLength(1);
  data.drivers[0]!.runde = 0;
  applySnapshot(s, data);
  expect(s.drivers[0]!.history).toHaveLength(0);
  expect(() => applySnapshot(s, { ...data, status: {} })).toThrow();
  expect(s.elapsed).toBe(12.345);
});
it("keeps DataGrid headers and columns together for copy and delete", async () => {
  const { withGridColumns } = await import("../src/core/runtime");
  const ns = nodes(
    '<datagrid nr="1" left="0" top="0" breite="400" hoehe="200"/><datagrid nr="1" variable="runde"/><datagrid nr="1" variable="rundenzeit"/><fahrer nr="1"/>',
  );
  expect(withGridColumns([ns[0]!.id], ns)).toEqual(
    ns.slice(0, 3).map((n) => n.id),
  );
  expect(withGridColumns([ns[1]!.id], ns)).toEqual([ns[1]!.id]);
});

it("formats time and history options without changing XML", async () => {
  const { displayText } = await import("../src/core/simulator");
  const s = createSimulation();
  s.elapsed = 3661.25;
  s.drivers[0]!.history = [
    { lap: 1, time: 8.123, fuel: 90 },
    { lap: 2, time: 8.456, fuel: 80 },
  ];
  const ns = nodes(
    '<rennzeit nks="2"/><rennzeit option="h"/><histrundenzeit nr="1" mst="1" nks="3" option="R#"/><histrundenzeit nr="1" mst="1" nks="3" option="SZ#"/>',
  );
  expect(ns.map((n) => displayText(n, s))).toEqual([
    "61:01,25",
    "01:01:01",
    "2",
    "8,123",
  ]);
});
