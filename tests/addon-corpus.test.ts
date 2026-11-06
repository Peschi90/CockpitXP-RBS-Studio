import { it, expect } from "vitest";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { installedAddons } from "./installed-addons";
import { AddonEngine, parseAddon } from "../src/core/addons";
import { createSimulation, tick } from "../src/core/simulator";
const installed = installedAddons();
it.skipIf(!installed.length)(
  "compiles and exercises the installed AddOn corpus without modifying source",
  () => {
    const report: {
      name: string;
      events: number;
      error: string;
      windows: number;
      tables: number;
      files: number;
      calls: string[];
    }[] = [];
    for (const { pkg, file, hash } of installed) {
      const sim = createSimulation(),
        engine = new AddonEngine(sim, () => 6);
      let events = 0;
      try {
        events = parseAddon(pkg).programs.size;
        engine.load(pkg);
        sim.running = true;
        engine.start();
        const run = (seconds: number) => {
          for (let i = 0; i < seconds * 10 && engine.state.running; i++) {
            tick(sim, 0.1);
            engine.advance(0.1);
          }
        };
        run(12);
        engine.emit("KeyDown", 1, 89);
        run(10);
        engine.emit("KeyDown", 1, 89);
        run(1);
        engine.emit("KeyDown", 1, 74);
        run(0.2);
        for (const window of engine.objects.state.windows.filter(
          (w) => w.visible,
        )) {
          const plus = window.controls.find((c) => c.props.caption === "+");
          if (plus) {
            engine.objects.click(plus.id);
            run(0.1);
          }
          engine.objects.close(window.id);
        }
        run(0.2);
        for (let station = 1; station <= 6; station++) {
          engine.emit("DigInputEvent", 1, 3, station);
          run(0.2);
        }
        engine.emit("Slotrekord", 1);
        run(0.2);
        engine.emit("CUSensorGruppe", 1, 1, 1);
        run(0.2);
        engine.emit("Startampel", 1, 1);
        run(0.2);
        for (const name of Object.keys(engine.inputs)) {
          engine.setInput(name, true, 1, 1, 1);
          run(0.1);
          engine.setInput(name, false, 1, 1, 1);
        }
        engine.emit("KeyDown", 1, 76);
        run(0.2);
        sim.running = false;
        sim.phase = "chaos";
        run(0.2);
        sim.running = true;
        sim.phase = "race";
        run(0.2);
        sim.drivers[0]!.pit = true;
        run(4);
        sim.drivers[0]!.pit = false;
        run(0.2);
        sim.phase = "finish";
        sim.running = false;
        run(2);
        engine.stop();
      } catch (e) {
        engine.state.error = String(e);
      }
      report.push({
        name: pkg.name,
        events,
        error: engine.state.error,
        windows: engine.objects.state.windows.length,
        tables: engine.objects.state.tables.length,
        files: engine.files.size,
        calls: [...engine.apiCalls].sort(),
      });
      expect(
        createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
      ).toBe(hash);
    }
    fs.mkdirSync("reports", { recursive: true });
    fs.writeFileSync(
      "reports/addon-compatibility.json",
      JSON.stringify(report, null, 2),
    );
    expect(report.filter((r) => r.error)).toEqual([]);
  },
  120000,
);
