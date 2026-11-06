import { it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { AddonEngine, demoAddon, parseAddon } from "../src/core/addons";
import {
  createSimulation,
  displayText,
  tick,
  resetSimulation,
} from "../src/core/simulator";
import { parseRbs, toCssColor } from "../src/core/xml";
import { createTemplate } from "../src/core/templates";
import { applySnapshot } from "../src/core/live";
import { barPercent, symbolVisible } from "../src/core/runtime";
function pkg(script: string, event = "StartRealTime") {
  return {
    name: "Test",
    source: `<AddOnClasses><${event}><![CDATA[${script}]]></${event}></AddOnClasses>`,
    config: "",
    screens: {},
  };
}
it("distinguishes slot font and background, including live COLORREF zero", () => {
  expect(toCssColor("slotcolor", 1)).not.toBe(toCssColor("slotcolorbg", 1));
  expect(
    toCssColor("SLOTCOLOR", 2, "", { font: "#ffffff", background: "#111111" }),
  ).toBe("#ffffff");
  const s = createSimulation();
  applySnapshot(s, {
    status: { rennzeit: 0, rennstatus: 1 },
    drivers: [{ slot: 2, runde: 0, rundenzeit: 0 }],
    profiles: [{ slot: 2, slotfarbefont: 0, slotfarbeback: 255 }],
  });
  expect(s.drivers[1]!.font).toBe("#000000");
  expect(s.drivers[1]!.background).toBe("#ff0000");
});
it("executes procedures, functions, loops and preserves strings/comments", () => {
  const s = createSimulation(),
    e = new AddonEngine(s, () => 6);
  e.load(
    pkg(`var i,total:Integer;
    function Twice(n:Integer):Integer; begin Result:=n*2; end;
    procedure Add(n:Integer); begin total:=total+n; end;
    begin { ' ignored } total:=0; for i:=1 to 3 do Add(Twice(i));
      if total=12 then cpSetRBSStringVar('Result',0,'It''s correct');
      repeat total:=total-1; until total=10;
      cpSetIntegerVar('Total',total);
    end.`),
  );
  e.start();
  expect(e.state.error).toBe("");
  expect(s.addonValues["Result:0"]).toBe("It's correct");
  expect(e.variables.get("total")).toBe(10);
});
it("suspends and resumes cpSleep and terminates an infinite loop", () => {
  const s = createSimulation(),
    e = new AddonEngine(s, () => 6);
  e.load(
    pkg(
      "begin cpSetIntegerVar('x',1); cpSleep(200); cpSetIntegerVar('x',2); end.",
    ),
  );
  e.start();
  expect(e.variables.get("x")).toBe(1);
  e.advance(0.1);
  expect(e.variables.get("x")).toBe(1);
  e.advance(0.1);
  expect(e.variables.get("x")).toBe(2);
  e.load(pkg("begin while True do begin end; end."));
  e.start();
  expect(e.state.running).toBe(false);
  expect(e.state.error).toContain("Ausführungslimit");
});
it("routes values, bars and named symbols by slot without editing XML", () => {
  const s = createSimulation(),
    e = new AddonEngine(s, () => 6);
  e.load(demoAddon);
  e.start();
  const source = createTemplate("blank").replace(
    "<variablen>",
    '<variablen><addonVariable nr="0" addonvariablename="DemoStatus"/><progressbar nr="1" typ="AddonBar" addonvariablename="DemoTank"/><symbole_einaus nr="1" symboladdonname="DemoSymbol"/>',
  );
  const d = parseRbs(source);
  expect(displayText(d.elements[0]!, s)).toBe("Pause");
  expect(barPercent(d.elements[1]!, s)).toBe(75);
  expect(symbolVisible(d.elements[2]!, s)).toBe(true);
  expect(d.source).toBe(source);
  s.drivers[0]!.laps = 3;
  s.running = true;
  e.advance(0.1);
  expect(String(s.addonValues["DemoStatus:0"])).toContain("Runde 3");
  e.stop();
  expect(s.addonValues).toEqual({});
  expect(s.addonSymbols).toEqual({});
});
it("rejects unsupported syntax before starting and reports runtime API errors", () => {
  expect(() =>
    parseAddon(pkg("var x: record a:Integer; end; begin end.")),
  ).toThrow();
  const e = new AddonEngine(createSimulation(), () => 6);
  e.load(pkg("begin cpUnknownFunction(); end."));
  e.start();
  expect(e.state.error).toContain("cpunknownfunction");
  expect(e.state.running).toBe(false);
});
it("keeps file writes virtual and restarts on simulator reset", () => {
  const s = createSimulation(),
    e = new AddonEngine(s, () => 6);
  e.load(
    pkg(
      "var f:TStringList; begin f:=TStringList.Create; f.Add('hello'); f.SaveToFile('C:\\must-not-write.txt'); f.Free; cpSetIntegerVar('x',1); end.",
    ),
  );
  e.start();
  expect(e.files.get("c:\\must-not-write.txt")).toBe("hello");
  e.variables.set("x", 9);
  resetSimulation(s);
  e.advance(0.1);
  expect(e.variables.get("x")).toBe(1);
});
const local = path.resolve(process.cwd(), "../AddOn.cps.xml");
it.skipIf(!fs.existsSync(local))(
  "runs the installed Pace-Car source through deploy, return and close",
  () => {
    const s = createSimulation(),
      e = new AddonEngine(s, () => 6);
    const root = path.resolve(process.cwd(), "..");
    const screens = Object.fromEntries(
      ["MP-SafetyCar-Kompakt.xml", "MP-SafetyCar-Overlay.xml"].map((name) => [
        name,
        {
          source: fs.readFileSync(path.join(root, name), "latin1"),
          assets: {},
        },
      ]),
    );
    e.load({
      name: "Pace-Car-Handling",
      source: fs.readFileSync(local, "utf8"),
      config: fs.readFileSync(path.join(root, "ConfigPackage.xml"), "utf8"),
      screens,
    });
    for (const c of e.state.settings)
      if (
        [
          "Einheit",
          "Intervall",
          "PCSoft",
          "EinsatzRunden",
          "EinfahrSekunden",
        ].includes(c.name)
      )
        c.value = "1";
    e.start();
    s.running = true;
    for (let n = 0; n < 120; n++) {
      tick(s, 0.1);
      e.advance(0.1);
    }
    expect(e.state.error).toBe("");
    expect(e.variables.get("pc_state")).toBe(2);
    // Blink cycle can hide the overlay; verify it is shown during at least one tick.
    let shown = s.overlays.length > 0;
    for (let n = 0; n < 20; n++) {
      tick(s, 0.1);
      e.advance(0.1);
      shown ||= s.overlays.length > 0;
    }
    expect(shown).toBe(true);
    expect(s.addonValues["PC_RBSStatus:0"]).toBe("IM EINSATZ");
    e.emit("StartZiel", 8);
    e.advance(0.1);
    e.advance(0.1);
    expect(e.variables.get("pc_state")).toBe(3);
    for (let n = 0; n < 15; n++) {
      tick(s, 0.1);
      e.advance(0.1);
    }
    expect(e.state.error).toBe("");
    expect(e.variables.get("pc_state")).toBe(1);
    expect(e.files.has("virtual:\\addon\\simulation-fahrzeuge.txt")).toBe(true);
    e.stop();
    expect(e.variables.get("pc_close")).toBe(1);
    expect(s.overlays).toHaveLength(0);
  },
);

it("keeps sleep timing at 10x speed and does not hide unsupported APIs in except", () => {
  const s = createSimulation(),
    e = new AddonEngine(s, () => 6);
  s.running = true;
  s.speed = 10;
  e.load(
    pkg(
      "var i:Integer; begin for i:=1 to 10 do begin cpSleep(100); cpSetIntegerVar('ticks',i); end; end.",
    ),
  );
  e.start();
  e.advance(0.1);
  expect(e.variables.get("ticks")).toBe(10);
  e.load(
    pkg(
      "begin try cpUnknownFunction(); except cpSetIntegerVar('ignored',1); end; end.",
    ),
  );
  e.start();
  expect(e.state.error).toContain("cpunknownfunction");
  expect(e.variables.has("ignored")).toBe(false);
  e.load(
    pkg(
      "begin cpEnterCriticalSection; cpSleep(100); cpLeaveCriticalSection; end.",
    ),
  );
  e.start();
  e.advance(0.1);
  expect(e.state.error).toBe("");
});
