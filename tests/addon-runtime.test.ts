import { it, expect, vi } from "vitest";
import {
  AddonEngine,
  AddonSession,
  type AddonPackage,
} from "../src/core/addons";
import { createSimulation, tick, displayText } from "../src/core/simulator";
import { parseRbs } from "../src/core/xml";
import { createTemplate } from "../src/core/templates";
import { symbolVisible } from "../src/core/runtime";
import { installedAddons } from "./installed-addons";
function pkg(
  source: string,
  event = "StartRealTime",
  name = "Test",
): AddonPackage {
  return {
    name,
    source: `<AddOnClasses><${event}><![CDATA[${source}]]></${event}></AddOnClasses>`,
    config: "",
    screens: {},
  };
}
function run(source: string) {
  const sim = createSimulation(),
    engine = new AddonEngine(sim, () => 6);
  engine.load(pkg(source));
  engine.start();
  return { sim, engine };
}
it("handles multi-dimensional arrays, by-reference arguments, cases, list indices and character literals", () => {
  const { engine } =
    run(`const N=3; var a:array[1..2,0..N] of Integer; i:Integer; text:String; l:TStringList;
 procedure Increase(var v:Integer);begin Inc(v,2);end;
 begin a[2,3]:=40;Increase(a[2,3]);case a[2,3] of 1..10:text:='bad';41,42:text:='OK'#13#10;else text:='bad';end;
 l:=TStringList.Create;l.Add(text);l[0]:=l[0]+'!';cpSetStringVar('answer',l[0]);cpSetIntegerVar('answer',a[2][3]);
 text:='abc';Delete(text,2,1);Insert('B',text,2);cpSetStringVar('edit',text);
 cpSetStringVar('format',Format('%s %d',[FormatDateTime('nn:ss,zzz',1234/86400000),a[2,3]]));end.`);
  expect(engine.state.error).toBe("");
  expect(engine.variables.get("answer")).toBe(42);
  expect(engine.variables.get("edit")).toBe("aBc");
  expect(engine.variables.get("format")).toBe("00:01,234 42");
});
it("rejects out-of-range indices and unsupported APIs, and enforces allocation limits", () => {
  expect(
    run("var a:array[1..2] of Integer; begin a[0]:=5; end.").engine.state.error,
  ).toContain("Index 0");
  expect(
    run("var a:array[1..100,1..1000] of Integer; begin end.").engine.state
      .error,
  ).toContain("Arraylimit");
  expect(
    run("var x:Variant;begin x:=CreateOleObject('WScript.Shell');end.").engine
      .state.error,
  ).toContain("virtuelle Excel");
});
it("serializes sleeping critical sections and releases locks on exit", () => {
  const sim = createSimulation(),
    e = new AddonEngine(sim, () => 6);
  e.load(
    pkg(
      `var n:Integer;begin cpEnterCriticalSectionEvent;n:=cpGetIntegerVar('n');cpSleep(100);cpSetIntegerVar('n',n+1);exit;end.`,
      "StartZiel",
    ),
  );
  e.start();
  e.emit("StartZiel");
  e.emit("StartZiel");
  e.advance(0.1);
  e.advance(0.1);
  e.advance(0.1);
  expect(e.state.error).toBe("");
  expect(e.variables.get("n")).toBe(2);
});
it("cooperatively polls inputs in original busy-wait scripts", () => {
  const { engine } = run(
    "begin while not cpGetInput('Sensor') do begin end;cpSetIntegerVar('arrived',1);end.",
  );
  engine.advance(1);
  expect(engine.state.error).toBe("");
  expect(engine.variables.has("arrived")).toBe(false);
  engine.setInput("Sensor", true);
  engine.advance(0.1);
  expect(engine.variables.get("arrived")).toBe(1);
});
it("executes callbacks in the original scope and resumes after closing a modal form", () => {
  const { engine } = run(`var f:TForm;b:TButton;l:TLabel;count:Integer;
 procedure Click(Sender:TButton);begin Inc(count);l.Caption:=IntToStr(count);cpSetIntegerVar('clicked',count);end;
 begin f:=TForm.Create(nil);l:=TLabel.Create(f);l.Parent:=f;l.Caption:='0';b:=TButton.Create(f);b.Parent:=f;b.Caption:='+';b.OnClick:=@Click;cpShow(f);while f.ModalResult=mrNone do cpSleep(100);cpFormFree(f);cpSetIntegerVar('closed',1);end.`);
  const w = engine.objects.state.windows[0]!;
  expect(w.visible).toBe(true);
  engine.objects.click(w.controls[1]!.id);
  engine.advance(0.1);
  expect(engine.variables.get("clicked")).toBe(1);
  expect(w.controls[0]!.props.caption).toBe("1");
  engine.objects.close(w.id);
  engine.advance(0.1);
  expect(engine.state.error).toBe("");
  expect(engine.variables.get("closed")).toBe(1);
  expect(w.visible).toBe(false);
});
it("appends file streams to a virtual seed and keeps package/global output routes separate", () => {
  const e = new AddonEngine(createSimulation(), () => 6),
    p = pkg(
      "var f:TFileStream;begin f:=TFileStream.Create(cpGetPackagePath+'\\seed.txt',fmOpenWrite or fmShareDenyNone);f.Seek(0,soFromEnd);f.Write(#13#10'next',6);f.Free;cpSetStringVar('Info','hello');end.",
    );
  p.files = { "seed.txt": "original" };
  e.load(p);
  e.start();
  expect(e.state.error).toBe("");
  expect(e.files.get("virtual:\\addon\\seed.txt")).toBe("original\r\nnext");
  const doc = parseRbs(
    createTemplate("blank").replace(
      "<variablen>",
      '<variablen><scriptVariablePackage nr="1" option="Info"/>',
    ),
  );
  expect(displayText(doc.elements[0]!, e.sim)).toBe("hello");
});
it("shares virtual sibling files and globals across packages while isolating local variables and outputs", () => {
  const s = createSimulation(),
    session = new AddonSession(true),
    a = new AddonEngine(s, () => 6, session),
    b = new AddonEngine(s, () => 6, session);
  const pa = pkg(
    "var f:TStringList;begin cpSetIntegerVarG('shared',7);cpSetIntegerVar('local',10);cpSetRBSStringVar('A',0,'a');f:=TStringList.Create;f.Add('ready');f.SaveToFile(cpGetPackagePath+'\\phase.txt');end.",
    "StartRealTime",
    "A",
  );
  pa.virtualPath = "virtual:\\addons\\mp\\A";
  const pb = pkg(
    "var f:TStringList;begin cpSetIntegerVar('received',cpGetIntegerVarG('shared'));cpSetIntegerVar('otherlocal',cpGetIntegerVar('local'));f:=TStringList.Create;f.LoadFromFile(cpGetPackagePath+'\\..\\A\\phase.txt');cpSetRBSStringVar('B',0,f[0]);end.",
    "StartRealTime",
    "B",
  );
  pb.virtualPath = "virtual:\\addons\\mp\\B";
  a.load(pa);
  b.load(pb);
  a.start();
  b.start();
  expect(b.state.error).toBe("");
  expect(b.variables.get("received")).toBe(7);
  expect(b.variables.get("otherlocal")).toBe(0);
  expect(s.addonValues["B:0"]).toBe("ready");
  a.stop();
  expect(s.addonValues["A:0"]).toBeUndefined();
  expect(s.addonValues["B:0"]).toBe("ready");
  b.stop();
  expect(s.addonValues).toEqual({});
});
it("broadcasts box penalties, serves tenths of seconds only in the pit, and restores fuel rules", () => {
  const s = createSimulation(),
    session = new AddonSession(true),
    a = new AddonEngine(s, () => 6, session),
    b = new AddonEngine(s, () => 6, session);
  b.load(
    pkg(
      "begin cpSetIntegerVar('penalty',Cockpit.Parameter);cpSetIntegerVar('station',Cockpit.Station);end.",
      "Bestrafung",
      "observer",
    ),
  );
  b.start();
  a.load(
    pkg(
      "begin cpAddOnBoxenStrafe2(Cockpit.FahrerName,3,20,1,False,2,False);end.",
      "StartRealTime",
      "penalty",
    ),
  );
  a.start();
  b.advance(0);
  expect(b.variables.get("penalty")).toBe(3);
  expect(b.variables.get("station")).toBe(1);
  const d = s.drivers[0]!;
  s.running = true;
  tick(s, 1);
  expect(d.penalty).toBe(2);
  d.fuel = 40;
  d.pit = true;
  tick(s, 1);
  expect(d.penalty).toBe(1);
  tick(s, 1);
  expect(d.boxPenalty).toBe(null);
  expect(d.fuel).toBe(40);
  tick(s, 1);
  expect(d.fuel).toBe(40);
  d.pit = false;
  tick(s, 0.1);
  d.pit = true;
  tick(s, 1);
  expect(d.fuel).toBeGreaterThan(40);
});
it("routes sensor station and simulator button actions", () => {
  const { engine, sim } = run(
    "begin cpSimulateButton(3);cpSetIntegerVar('target',cpGetTargetTime);end.",
  );
  expect(sim.phase).toBe("chaos");
  expect(sim.running).toBe(false);
  expect(engine.variables.get("target")).toBe(600);
  engine.load(
    pkg(
      "begin cpSetIntegerVar('station',Cockpit.Station);cpSetIntegerVar('device',Cockpit.Parameter);end.",
      "DigInputEvent",
    ),
  );
  engine.start();
  engine.emit("DigInputEvent", 2, 3, 6);
  engine.advance(0);
  expect(engine.variables.get("station")).toBe(6);
  expect(engine.variables.get("device")).toBe(3);
});
it("emits record events once and displays standard damage symbols", () => {
  const s = createSimulation(),
    e = new AddonEngine(s, () => 6);
  e.load(
    pkg(
      "begin cpSetIntegerVar('records',cpGetIntegerVar('records')+1);cpSymbolEvent('Motorschaden Ein',Cockpit.Slot);end.",
      "Slotrekord",
    ),
  );
  e.start();
  s.drivers[0]!.best = 7;
  e.advance(0.1);
  e.advance(0.1);
  expect(e.variables.get("records")).toBe(1);
  const doc = parseRbs(
    createTemplate("blank").replace(
      "<variablen>",
      '<variablen><symbole_einaus nr="1" audioid_ein="73" audioid_aus="74"/>',
    ),
  );
  expect(symbolVisible(doc.elements[0]!, s)).toBe(true);
  e.stop();
  expect(symbolVisible(doc.elements[0]!, s)).toBe(false);
});
const dialog = installedAddons().find((p) =>
  p.pkg.name.endsWith("Arduino_dialog"),
);
it.skipIf(!dialog)(
  "runs the installed joker dialog and its actual plus/minus callbacks",
  () => {
    const s = createSimulation(),
      e = new AddonEngine(s, () => 6);
    s.running = true;
    e.load(dialog!.pkg);
    e.start();
    e.emit("KeyDown", 1, 74);
    e.advance(0.1);
    expect(e.state.error).toBe("");
    const w = e.objects.state.windows.find((w) => w.visible)!;
    expect(w).toBeDefined();
    const plus = w.controls.find((c) => c.props.caption === "+")!;
    expect(plus).toBeDefined();
    const before = Number(e.variables.get("anzahlchaos1"));
    e.objects.click(plus.id);
    e.advance(0.1);
    expect(e.state.error).toBe("");
    expect(e.variables.get("anzahlchaos1")).toBe(before + 1);
    e.objects.click(w.controls.find((c) => c.props.caption === "-")!.id);
    e.advance(0.1);
    expect(e.variables.get("anzahlchaos1")).toBe(before);
    e.objects.close(w.id);
    e.advance(0.2);
    expect(e.variables.get("dialogoffen")).toBe(0);
  },
);
const rain = installedAddons().find((p) =>
  p.pkg.name.endsWith("Cp-Regensimulation-CU"),
);
it.skipIf(!rain)(
  "runs installed rain activation, pending CU updates, fuel lock and recovery",
  () => {
    const s = createSimulation(),
      e = new AddonEngine(s, () => 6);
    s.running = true;
    e.load(rain!.pkg);
    for (const c of e.state.settings) {
      if (c.name === "Regenwahrscheinlichkeit") c.value = "100";
      if (c.name === "RegenZeitCheck") c.value = "1";
      if (c.name === "RegenZeitMin" || c.name === "RegenZeitMax") c.value = "4";
      if (c.name === "TankenSperren") c.value = "1";
    }
    e.start();
    const step = (seconds: number) => {
      for (let i = 0; i < seconds * 10; i++) {
        tick(s, 0.1);
        e.advance(0.1);
      }
    };
    step(61);
    expect(e.state.error).toBe("");
    expect(e.session.globals.get("global:3")).toBe(1);
    expect(s.addonSymbols["motorschaden:1"]).toBe(true);
    expect(s.drivers[0]!.tankLocked).toBe(true);
    expect(s.drivers[0]!.pendingCuSpeed ?? s.drivers[0]!.cuSpeed).toBe(3);
    step(10);
    expect(e.session.globals.get("global:3")).toBe(0);
    expect(s.addonSymbols["motorschaden:1"]).toBe(false);
    expect(s.drivers[0]!.tankLocked).toBe(false);
    expect(s.drivers[0]!.pendingCuSpeed ?? s.drivers[0]!.cuSpeed).toBe(15);
    e.stop();
  },
);
const damage = installedAddons().find((p) =>
  p.pkg.name.endsWith("Cp-SchadenSimulation-CU"),
);
it.skipIf(!rain || !damage)(
  "lets the installed damage addon suppress the installed rain addon through global variables",
  () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.25);
    try {
      const s = createSimulation(),
        session = new AddonSession(true),
        r = new AddonEngine(s, () => 6, session),
        d = new AddonEngine(s, () => 6, session);
      s.running = true;
      s.targetLaps = 2;
      r.load(rain!.pkg);
      d.load(damage!.pkg);
      for (const c of r.state.settings) {
        if (c.name === "Regenwahrscheinlichkeit") c.value = "100";
        if (c.name === "RegenZeitCheck") c.value = "1";
      }
      for (const c of d.state.settings) {
        if (c.name === "Wahrscheinlichkeit") c.value = "100";
        if (c.name === "MaxAnzahlSchaden") c.value = "1";
      }
      r.start();
      d.start();
      for (let i = 0; i < 620; i++) {
        tick(s, 0.1);
        r.advance(0.1);
        d.advance(0.1);
      }
      expect(r.state.error).toBe("");
      expect(d.state.error).toBe("");
      expect(session.globals.get("global:1")).toBe(1);
      expect(session.globals.get("global:3")).toBe(0);
      expect(s.drivers[0]!.cuBrake).toBe(3);
      r.stop();
      d.stop();
    } finally {
      random.mockRestore();
    }
  },
);
