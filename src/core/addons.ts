import { reactive } from "vue";
import { AddonObjects } from "./addonObjects";
import {
  UnsupportedPascal,
  compilePascal,
  executePascal,
  type Execution,
  type Program,
  type Value,
  type PascalHost,
} from "./pascal";
import { ranked, type Simulation } from "./simulator";
import { fromCssColor, toCssColor } from "./xml";
export interface AddonPackage {
  name: string;
  source: string;
  config: string;
  screens: Record<string, { source: string; assets: Record<string, string> }>;
  warnings?: string[];
  files?: Record<string, string>;
  virtualPath?: string;
}
export interface AddonSetting {
  name: string;
  label: string;
  value: string;
  type: string;
  choices: string[];
}
export function parseAddon(pkg: AddonPackage) {
  function xml(source: string) {
    if (source.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(source))
      throw Error("Nicht unterstütztes AddOn-XML");
    const d = new DOMParser().parseFromString(source, "application/xml");
    if (d.querySelector("parsererror")) throw Error("Ungültiges AddOn-XML");
    return d;
  }
  const document = xml(pkg.source);
  if (!["AddOnClasses", "AddOn"].includes(document.documentElement.tagName))
    throw Error(
      "Bitte AddOn.cps.xml mit Pascal-Quelltext auswählen. ILC-Dateien werden nicht unterstützt.",
    );
  const programs = new Map<string, Program>();
  for (const event of document.documentElement.children) {
    if (event.children.length || !(event.textContent || "").trim()) continue;
    try {
      programs.set(
        event.tagName.toLowerCase(),
        compilePascal(event.textContent!),
      );
    } catch (e) {
      throw Error(`${event.tagName}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (!programs.size)
    throw Error("Das AddOn enthält keine ausführbaren Ereignisse");
  const settings: AddonSetting[] = [];
  if (pkg.config)
    for (const node of xml(pkg.config).querySelectorAll("Variable")) {
      const name = node.getAttribute("name") || "",
        type = node.getAttribute("datatyp") || "String";
      if (!name || name === "xxx" || type === "Text") continue;
      settings.push({
        name,
        label: node.getAttribute("beschreibung") || name,
        value: node.getAttribute("value") || "",
        type,
        choices: (node.getAttribute("set") || "").split("|"),
      });
    }
  return { programs, settings };
}
type Job = {
  owner: symbol;
  event: string;
  execution: Execution;
  wake: number;
  line: number;
  steps: number;
};
export class AddonSession {
  files = reactive(new Map<string, string>());
  globals = new Map<string, Value>();
  owners = new Map<string, symbol>();
  handle = 0;
  engines = new Set<AddonEngine>();
  emit(event: string, slot = 1, parameter = 0, station = 0) {
    for (const e of this.engines) e.emit(event, slot, parameter, station);
  }
  constructor(public shared = false) {}
}
export class AddonEngine {
  state = reactive({
    running: false,
    error: "",
    logs: [] as string[],
    events: [] as string[],
    settings: [] as AddonSetting[],
    name: "",
    mode: "R",
    analogue: false,
    keyPenaltySeconds: 5,
    warnings: [] as string[],
  });
  variables = new Map<string, Value>();
  apiCalls = new Set<string>();
  files: Map<string, string>;
  packageValues = reactive({} as Record<string, string | number>);
  private identity = Symbol();
  private overlayHandles = new Set<number>();
  inputs = reactive({} as Record<string, boolean>);
  outputs = reactive({} as Record<string, boolean>);
  readonly objects = new AddonObjects(
    (path) => this.readFile(path),
    (path, data) => this.writeFile(path, data),
    (fn, args) => {
      if (this.state.running)
        this.enqueue("Dialog.OnClick", fn.routine(args), Symbol());
    },
  );
  private locks = new Map<string, { owner: symbol; count: number }>();
  private blink = new Map<
    number,
    { interval: number; start: number; owner: symbol }
  >();
  private packagePath = "virtual:\\addon";
  private path(path: string) {
    const parts = path.replaceAll("/", "\\").toLowerCase().split("\\"),
      result: string[] = [];
    for (const part of parts) {
      if (part === "..") result.pop();
      else if (part && part !== ".") result.push(part);
    }
    return result.join("\\");
  }
  private readFile(path: string) {
    const data = this.files.get(this.path(path));
    if (data === undefined)
      throw Error("Virtuelle Datei nicht vorhanden: " + path);
    return data;
  }
  private writeFile(path: string, data: string) {
    const key = this.path(path);
    if (
      data.length > 2_000_000 ||
      (!this.files.has(key) && this.files.size >= 128)
    )
      throw Error("Virtuelles Dateilimit erreicht");
    this.files.set(key, data);
  }
  setInput(name: string, value: boolean, slot = 1, station = 1, device = 1) {
    this.inputs[name] = value;
    this.variables.set("input:" + name.toLowerCase(), value);
    this.emit("DigInputEvent", slot, device, station);
  }
  private enqueue(event: string, execution: Execution, owner: symbol) {
    if (this.jobs.length >= 64) {
      this.fail(event, 0, "Zu viele wartende Ereignisse");
      return;
    }
    this.jobs.push({
      event,
      execution,
      owner,
      wake: this.now,
      line: 0,
      steps: 0,
    });
  }
  private release(owner: symbol) {
    for (const [key, lock] of this.locks)
      if (lock.owner === owner) this.locks.delete(key);
    for (const [handle, b] of this.blink)
      if (b.owner === owner) {
        this.sim.overlays = this.sim.overlays.filter(
          (o) => o.handle !== handle,
        );
        this.blink.delete(handle);
      }
  }

  private programs = new Map<string, Program>();
  private jobs: Job[] = [];
  private now = 0;
  private lastPhase = "";
  private lastReset = 0;
  private laps: number[] = [];
  private pits: boolean[] = [];
  private bests: number[] = [];
  private disqualified: boolean[] = [];
  private pkg?: AddonPackage;
  get sourcePackage() {
    return this.pkg;
  }
  constructor(
    public sim: Simulation,
    public slots: () => number,
    public session = new AddonSession(),
  ) {
    this.files = session.files;
  }
  load(pkg: AddonPackage) {
    const parsed = parseAddon(pkg); // A failed import leaves the previous package intact.
    this.stop();
    this.pkg = pkg;
    this.packagePath = pkg.virtualPath ?? "virtual:\\addon";
    this.programs = parsed.programs;
    this.state.settings = parsed.settings;
    this.state.name = pkg.name;
    this.state.events = [...this.programs.keys()];
    this.state.error = "";
    this.state.logs = [];
    for (const key of Object.keys(this.inputs)) delete this.inputs[key];
    for (const m of pkg.source.matchAll(/cpGetInput\s*\(\s*'([^']+)'/gi))
      this.inputs[m[1]!] = false;
    this.state.warnings = [...(pkg.warnings ?? [])];
    if (/cpGetRacingStatus\s*\(\s*\)\s*=\s*'[TQ]'/i.test(pkg.source))
      this.state.warnings.push(
        "Dieses Skript vergleicht cpGetRacingStatus mit T/Q. Cockpit liefert dort R/S/P; T/Q gehören zu cpGetRacingMode. Der Simulator führt den Originalcode unverändert aus.",
      );
    for (const warning of this.state.warnings) this.log(warning);
  }
  private output(
    area: "addonValues" | "addonSymbols" | "addonColors" | "packageValues",
    key: string,
    value: string | number | boolean,
  ) {
    (this.sim[area] as Record<string, string | number | boolean>)[key] = value;
    this.session.owners.set(area + ":" + key, this.identity);
  }
  private clearOutputs() {
    for (const [key, owner] of this.session.owners) {
      if (owner !== this.identity) continue;
      const colon = key.indexOf(":"),
        area = key.slice(0, colon) as
          "addonValues" | "addonSymbols" | "addonColors" | "packageValues";
      delete this.sim[area][key.slice(colon + 1)];
      this.session.owners.delete(key);
    }
    this.sim.overlays = this.sim.overlays.filter(
      (o) => !this.overlayHandles.has(o.handle),
    );
    this.overlayHandles.clear();
    for (const key of Object.keys(this.packageValues))
      delete this.packageValues[key];
  }
  start() {
    try {
      this.startInternal();
    } catch (e) {
      this.fail("StartRealTime", 0, e instanceof Error ? e.message : String(e));
    }
  }
  private startInternal() {
    if (!this.programs.size) return;
    if (this.sim.live) {
      this.state.error =
        "AddOn-Ausführung ist nur mit der lokalen Simulation möglich. Live-Daten zuerst trennen.";
      return;
    }
    this.jobs = [];
    this.variables.clear();
    this.apiCalls.clear();
    if (this.session.shared) {
      const prefix = this.path(this.packagePath) + "\\";
      for (const key of this.files.keys())
        if (key.startsWith(prefix)) this.files.delete(key);
    } else {
      this.files.clear();
      this.session.globals.clear();
    }
    this.locks.clear();
    this.blink.clear();
    this.objects.reset();
    for (const key of Object.keys(this.outputs)) delete this.outputs[key];
    for (const key of Object.keys(this.inputs)) this.inputs[key] = false;
    if (this.pkg?.config)
      this.writeFile(this.packagePath + "\\ConfigPackage.xml", this.pkg.config);
    for (const [name, data] of Object.entries(this.pkg?.files ?? {}))
      this.writeFile(this.packagePath + "\\" + name, data);
    this.now = 0;
    this.clearOutputs();
    for (const c of this.state.settings)
      this.variables.set(
        c.name.toLowerCase(),
        ["Integer", "Combo", "Float", "Extended"].includes(c.type)
          ? Number(c.value.replace(",", "."))
          : c.value,
      );
    this.state.error = "";
    this.state.logs = [];
    this.state.running = true;
    this.session.engines.add(this);
    this.lastReset = this.sim.resetId;
    this.laps = this.sim.drivers.map((d) => d.laps);
    this.pits = this.sim.drivers.map((d) => d.pit);
    this.bests = this.sim.drivers.map((d) => d.best);
    this.disqualified = this.sim.drivers.map((d) => d.disqualified);
    this.lastPhase = "";
    for (const [key, value] of this.variables)
      if (typeof value === "string" || typeof value === "number")
        this.packageValues[key] = value;
    for (const warning of this.state.warnings) this.log(warning);
    if (this.pkg?.config) {
      const xml = new DOMParser().parseFromString(
        this.pkg.config,
        "application/xml",
      );
      for (const node of xml.querySelectorAll("Variable")) {
        const setting = this.state.settings.find(
          (s) => s.name === node.getAttribute("name"),
        );
        if (setting) node.setAttribute("value", setting.value);
      }
      this.writeFile(
        this.packagePath + "\\ConfigPackage.xml",
        new XMLSerializer().serializeToString(xml),
      );
    }
    this.emit("StartRealTime");
    this.flush();
    if (!this.state.running) return;
    this.emit("ChangeRealTimeStatus", 1, 0);
    this.flush();
    this.log(
      "AddOn gestartet · virtuelle Dateien und Hardware · lokale Simulation",
    );
    this.advance(0);
  }
  stop() {
    if (this.state.running) {
      this.emit("BeforeClose");
      this.flush();
    }
    this.jobs = [];
    this.locks.clear();
    this.blink.clear();
    this.session.engines.delete(this);
    this.state.running = false;
    this.clearOutputs();
  }
  log(message: string) {
    this.state.logs.push(
      `${(this.now / 1000).toFixed(2)} s · ${message.slice(0, 2000)}`,
    );
    if (this.state.logs.length > 150) this.state.logs.shift();
  }
  emit(event: string, slot = 1, parameter = 0, station = 0) {
    if (!this.state.running) return;
    const program = this.programs.get(event.toLowerCase());
    if (!program) return;
    if (this.jobs.length >= 64) {
      this.fail(event, 0, "Zu viele wartende Ereignisse");
      return;
    }
    const owner = Symbol(event);
    this.enqueue(
      event,
      executePascal(program, this.host(slot, parameter, station, event, owner)),
      owner,
    );
  }

  advance(seconds: number) {
    if (!this.state.running) return;
    if (this.sim.live) {
      this.stop();
      return;
    }
    if (this.sim.resetId !== this.lastReset) {
      this.start();
      return;
    }
    const target =
      this.now +
      Math.max(0, Math.min(1, seconds)) *
        1000 *
        (this.sim.running ? this.sim.speed : 1);
    const phase =
      this.sim.phase === "finish"
        ? "4"
        : !this.sim.running || this.sim.phase === "chaos"
          ? "6"
          : "1";
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      if (phase === "4") this.emit("ChangeRealTimeStatus", 1, 3);
      this.emit("ChangeRealTimeStatus", 1, Number(phase));
    }
    for (const d of this.sim.drivers.slice(0, this.slots())) {
      const previous = this.laps[d.id - 1] ?? d.laps;
      for (
        let lap = previous + 1;
        lap <= Math.min(d.laps, previous + 20);
        lap++
      )
        this.emit("StartZiel", d.id);
      if (this.pits[d.id - 1] !== d.pit)
        this.emit(d.pit ? "TankenEinfahrt" : "TankenAusfahrt", d.id);
      if (d.best < (this.bests[d.id - 1] ?? d.best))
        this.emit("Slotrekord", d.id);
      if (d.disqualified && !this.disqualified[d.id - 1])
        this.emit("Bestrafung", d.id, 3, 2);
      this.bests[d.id - 1] = d.best;
      this.disqualified[d.id - 1] = d.disqualified;
      this.laps[d.id - 1] = d.laps;
      this.pits[d.id - 1] = d.pit;
    }
    let passes = 0,
      budget = 250000;
    while (this.state.running) {
      budget -= this.flush(budget);
      const next = Math.min(...this.jobs.map((j) => j.wake));
      if (next > target || !this.jobs.length) break;
      if (++passes > 1000 || budget <= 0) {
        this.fail(
          "Scheduler",
          0,
          "Zu viele Skriptschritte pro Simulationsschritt",
        );
        break;
      }
      this.now = next;
    }
    this.now = target;
    for (const overlay of this.sim.overlays) {
      const b = this.blink.get(overlay.handle);
      if (b)
        overlay.hidden =
          Math.floor((this.now - b.start) / b.interval) % 2 === 1;
    }
  }
  private fail(event: string, line: number, message: string) {
    this.state.error = `${event}, Zeile ${line}: ${message}`;
    this.log(this.state.error);
    this.state.running = false;
    this.session.engines.delete(this);
    this.locks.clear();
    this.blink.clear();
    this.jobs = [];
    this.clearOutputs();
  }
  private flush(budget = 250000) {
    let spent = 0;
    for (const job of [...this.jobs]) {
      if (!this.state.running || job.wake > this.now) continue;
      try {
        let count = 0;
        while (count++ < 50000) {
          if (++spent > budget)
            throw Error("Gesamtlimit für Skriptschritte erreicht");
          const next = job.execution.next();
          job.steps++;
          if (next.done) {
            this.release(job.owner);
            this.jobs = this.jobs.filter((j) => j !== job);
            break;
          }
          if ("step" in next.value) {
            if (next.value.step) job.line = next.value.step;
          } else {
            job.wake =
              this.now + ("sleep" in next.value ? next.value.sleep : 10);
            job.steps = 0;
            break;
          }
          if (job.steps >= 50000)
            throw Error(
              "Ausführungslimit erreicht; Schleife benötigt cpSleep oder ist zu groß",
            );
        }
      } catch (e) {
        this.fail(
          job.event,
          job.line,
          e instanceof Error ? e.message : String(e),
        );
      }
    }
    return spent;
  }
  private host(
    initialSlot: number,
    parameter: number,
    station: number,
    event: string,
    owner: symbol,
  ): PascalHost {
    let slot = initialSlot;
    const sim = this.sim;
    const driver = () => sim.drivers[Math.max(0, Math.min(7, slot - 1))]!;
    const color = (v: Value) => toCssColor((Number(v) >>> 0).toString(16));
    const boundedSet = (map: Map<string, Value>, key: string, value: Value) => {
      if (!map.has(key) && map.size >= 5000)
        throw Error("Variablenlimit erreicht");
      map.set(key, value);
    };
    const host: PascalHost = {
      member: (v, name, args) => this.objects.member(v, name, args),
      memberSet: (v, name, value) => this.objects.set(v, name, value),
      index: (v, indices) => this.objects.index(v, indices),
      lock: (name, enter) => {
        const key = name === "event" ? event.toLowerCase() : "package",
          lock = this.locks.get(key);
        if (enter) {
          if (lock && lock.owner !== owner) return false;
          if (lock) lock.count++;
          else this.locks.set(key, { owner, count: 1 });
        } else if (lock?.owner === owner && --lock.count === 0)
          this.locks.delete(key);
        return true;
      },
      get: (name) => {
        const d = driver(),
          order = ranked(sim),
          rank = order.findIndex((x) => x.id === d.id),
          front = order[Math.max(0, rank - 1)]!,
          leader = order[0]!;
        const gap = (other: typeof d) =>
          Math.max(0, other.laps + other.progress - d.laps - d.progress);

        const values: Record<string, Value> = {
          "cockpit.slot": slot,
          "cockpit.slotid": d.id,
          "cockpit.parameter": parameter,
          "cockpit.station": station,
          "cockpit.slotrekord": Math.round(d.best * 1000),
          "cockpit.fahrernamesprechen": d.name,
          "cockpit.fahrernamekurz": d.name
            .split(" ")
            .map((s) => s[0])
            .join(""),
          "cockpit.gesamtzeit": Math.round(
            d.history.reduce((sum, h) => sum + h.time, 0) * 1000,
          ),
          "cockpit.abstandrundefuehrenden": Math.floor(gap(leader)),
          "cockpit.abstandrundevordermann": Math.floor(gap(front)),
          "cockpit.abstandzeitfuehrenden": Math.round(
            gap(leader) * d.last * 1000,
          ),
          "cockpit.abstandzeitvordermann": Math.round(
            gap(front) * d.last * 1000,
          ),
          "cockpit.cockpittankensperren": d.tankLocked,
          "cockpit.custartampelstatus":
            sim.running && sim.phase !== "chaos" ? 0 : 1,
          fmopenwrite: 1,
          fmsharedenynone: 64,
          fmcreate: 65535,
          sofrombeginning: 0,
          sofromcurrent: 1,
          sofromend: 2,
          mrnone: 0,
          mrok: 1,
          mrcancel: 2,
          bssizeable: 2,
          bssingle: 1,
          bsdialog: 3,
          poscreencenter: 4,
          alclient: 5,

          "cockpit.runde": d.laps,
          "cockpit.rundenzeit": Math.round(d.last * 1000),
          "cockpit.schnellsterunde": Math.round(d.best * 1000),
          "cockpit.fahrername": d.name,
          "cockpit.fahrzeugname": d.car,
          "cockpit.position": ranked(sim).findIndex((x) => x.id === d.id) + 1,
          "cockpit.tankstand": d.fuel,
          "cockpit.tankreserve": sim.reserve,
          "cockpit.rennzeitinvers": Math.round(sim.elapsed * 1000),
          "cockpit.rennzeit": Math.round(
            (this.state.mode === "R"
              ? Math.max(0, sim.duration - sim.elapsed)
              : sim.elapsed) * 1000,
          ),
          "cockpit.rennteilnehmer": slot <= this.slots(),
          "cockpit.tankenaktiviert": true,
          "cockpit.eswirdgetankt": d.pit,
          "cockpit.wartezeitvortanken": 0,
          clblack: 0,
          clwhite: 0xffffff,
          clred: 255,
          clgreen: 32768,
          clyellow: 65535,
          clblue: 16711680,
        };
        if (Object.hasOwn(values, name)) return values[name]!;
        throw new UnsupportedPascal(`Unbekannte Eigenschaft ${name}`);
      },
      set: (name, value) => {
        if (name === "cockpit.slot") {
          if (
            !Number.isInteger(Number(value)) ||
            Number(value) < 1 ||
            Number(value) > 8
          )
            throw Error("Cockpit.Slot muss 1–8 sein");
          slot = Number(value);
        } else if (name === "cockpit.cockpittankensperren")
          driver().tankLocked = Boolean(value);
        else if (name === "cockpit.writelog") this.log(String(value));
        else
          throw new UnsupportedPascal(
            `Zuweisung an ${name} wird nicht unterstützt`,
          );
      },
      call: (name, args, refs) => {
        this.apiCalls.add(name);
        const text = (i = 0) => String(args[i] ?? ""),
          num = (i = 0) => Number(args[i] ?? 0);
        if (
          /^(tform|tbutton|tlabel|tchart|tlineseries|tbarseries|tfilestream|tadoconnection|tadoquery)\.create$/.test(
            name,
          ) ||
          name === "createoleobject"
        )
          return this.objects.create(name, args);
        if (/^cp(get|set)(integer|float|string)var(g)?$/.test(name)) {
          const key =
            (name.endsWith("g") ? "global:" : "") + text().toLowerCase();
          if (name.startsWith("cpset")) {
            const v = name.includes("string") ? text(1) : num(1);
            boundedSet(this.variables, key, v);
            this.packageValues[key] = v;
            this.output("packageValues", key, v);
            if (name.endsWith("g")) this.session.globals.set(key, v);
            return v;
          }
          return (
            (name.endsWith("g")
              ? this.session.globals.get(key)
              : this.variables.get(key)) ?? (name.includes("string") ? "" : 0)
          );
        }
        if (/^cpsetrbs(integer|float|string)var$/.test(name)) {
          if (Object.keys(sim.addonValues).length >= 5000)
            throw Error("RBS-Variablenlimit erreicht");
          this.output(
            "addonValues",
            `${text()}:${num(1)}`,
            name.includes("string") ? text(2) : num(2),
          );
          return args[2] ?? 0;
        }
        switch (name) {
          case "inttostr":
          case "floattostr":
            return text();
          case "strtoint":
          case "strtofloat": {
            const v = Number(text().replace(",", "."));
            if (!Number.isFinite(v)) throw Error("Ungültige Zahl");
            return v;
          }
          case "strtointdef": {
            const v = Number(text());
            return Number.isInteger(v) ? v : num(1);
          }
          case "trunc":
            return Math.trunc(num());
          case "round":
            return Math.round(num());
          case "abs":
            return Math.abs(num());
          case "min":
            return Math.min(num(), num(1));
          case "max":
            return Math.max(num(), num(1));
          case "copy":
            return text().slice(
              Math.max(0, num(1) - 1),
              Math.max(0, num(1) - 1) + Math.max(0, num(2)),
            );
          case "length":
            return text().length;
          case "uppercase":
            return text().toUpperCase();
          case "lowercase":
            return text().toLowerCase();
          case "trim":
            return text().trim();
          case "pos":
            return text(1).indexOf(text()) + 1;
          case "formatfloat": {
            const places = (text().split(".")[1] || "").length;
            return num(1).toFixed(Math.min(10, places));
          }
          case "random":
            return args.length
              ? Math.floor(Math.random() * num())
              : Math.random();
          case "randomize":
            return null;
          case "now":
            return this.now / 86400000 + 25569;
          case "chr":
            return String.fromCharCode(num());
          case "ord":
            return text().charCodeAt(0);
          case "format": {
            const list = args[1];
            if (!list || typeof list !== "object" || !("array" in list))
              throw Error("Format benötigt Parameterliste");
            let i = 0;
            return text().replace(
              /%%|%(?:(\d+):)?(?:-?\d+)?(?:\.(\d+))?([sdfgx])/gi,
              (token, at, precision, kind) => {
                if (token === "%%") return "%";
                const v = list.array[at !== undefined ? Number(at) : i++];
                return kind.toLowerCase() === "s"
                  ? String(v ?? "")
                  : kind.toLowerCase() === "d"
                    ? String(Math.trunc(Number(v)))
                    : kind.toLowerCase() === "x"
                      ? Number(v).toString(16)
                      : Number(v).toFixed(Number(precision ?? 2));
              },
            );
          }
          case "formatdatetime": {
            const d = new Date(Math.round((num(1) - 25569) * 86400000)),
              pad = (n: number, w = 2) => String(n).padStart(w, "0");
            const parts: Record<string, string> = {
              yyyy: pad(d.getUTCFullYear(), 4),
              yy: pad(d.getUTCFullYear() % 100),
              mm: pad(d.getUTCMonth() + 1),
              dd: pad(d.getUTCDate()),
              hh: pad(d.getUTCHours()),
              nn: pad(d.getUTCMinutes()),
              ss: pad(d.getUTCSeconds()),
              zzz: pad(d.getUTCMilliseconds(), 3),
            };
            return text().replace(
              /'([^']*)'|yyyy|zzz|yy|mm|dd|hh|nn|ss/gi,
              (t, literal) => literal ?? parts[t.toLowerCase()] ?? t,
            );
          }

          case "tstringlist.create":
            return { list: [] };
          case "virtual.write":
            this.writeFile(text(), text(1));
            return null;
          case "virtual.read":
            return this.readFile(text());
          case "fileexists":
            return this.files.has(this.path(text()));
          case "cpgetpackagepath":
            return this.packagePath;
          case "cpgetsystemtimems":
            return this.now;
          case "cpcountofslots":
            return this.slots();
          case "cpcountofmonitor":
            return 1;
          case "cpgetracingstatus":
            return sim.phase === "finish"
              ? "S"
              : !sim.running || sim.phase === "chaos"
                ? "P"
                : "R";
          case "cpgettargetlap":
            return sim.targetLaps;
          case "cpgettargettime":
            return Math.round(sim.duration);
          case "cpcourseanalogtyp":
            return this.state.analogue;
          case "cpgetslotidcolor": {
            const d = sim.drivers[num() - 1];
            if (!d) return false;
            if (!refs?.[1] || !refs?.[2])
              throw Error("cpGetSlotIDColor benötigt Farbvariablen");
            refs[1].set(parseInt(fromCssColor(d.font), 16));
            refs[2].set(parseInt(fromCssColor(d.background), 16));
            return true;
          }
          case "cpshow":
            this.objects.show(args[0]!);
            return null;
          case "cpformfree":
            this.objects.free(args[0]!);
            return null;
          case "cprennende":
            sim.phase = "finish";
            sim.running = false;
            return null;
          case "cpcancelstrafe": {
            const d = sim.drivers[num() - 1];
            if (d) {
              d.penalty = 0;
              d.boxPenalty = null;
            }
            return null;
          }
          case "cpaddonboxenstrafe":
          case "cpaddonboxenstrafe2": {
            const d = sim.drivers.find((d) => d.name === text());
            if (!d) return false;
            d.boxPenalty = {
              remaining: Math.max(0, num(2) / 10),
              deadline: d.laps + Math.max(0, num(1)),
              deduction: Math.max(0, num(3)),
              disqualify: Boolean(args[4]),
              endLaps: Math.max(0, num(5)),
              fuelAfter: args[6] !== false,
            };
            d.penalty = d.boxPenalty.remaining;
            this.session.emit("Bestrafung", d.id, 3, 1);
            this.log(`Boxenstrafe: ${d.name}, ${d.penalty.toFixed(1)} s`);
            return true;
          }
          case "cptastenstrafe": {
            const d = sim.drivers[num() - 1] ?? driver();
            const seconds = Math.max(
              0,
              Math.min(3600, Number(this.state.keyPenaltySeconds) || 0),
            );
            d.penalty += seconds;
            this.session.emit("Bestrafung", d.id, 2, 1);
            this.log("Simulierte Tastenstrafe: " + seconds + " s");
            return null;
          }
          case "cpsetnr":
            sim.dynamicSlot = Math.max(1, Math.min(8, num()));
            return null;
          case "cpsetslotsubscreen": {
            const o = sim.overlays.find((o) => o.handle === num());
            if (o) o.slot = Math.max(1, Math.min(8, num(1)));
            return null;
          }
          case "cpsymbolevent": {
            const match = text().match(
              /^(Motorschaden|Bremsschaden|Customer[123]) (Ein|Aus)$/i,
            );
            if (!match)
              throw new UnsupportedPascal(
                "Unbekanntes Symbolereignis: " + text(),
              );
            this.output(
              "addonSymbols",
              `${match[1]!.toLowerCase()}:${num(1) || slot}`,
              match[2]!.toLowerCase() === "ein",
            );
            return null;
          }
          case "cpgetracingmode":
            return this.state.mode;
          case "cpgetstatusbestrafung":
            return (
              Boolean(sim.drivers[num() - 1]?.boxPenalty) ||
              (sim.drivers[num() - 1]?.penalty ?? 0) > 0
            );
          case "cpaddonsymbolevent":
            this.output(
              "addonSymbols",
              `${text()}:${num(1)}`,
              Boolean(args[2]),
            );
            return null;
          case "cpsetrbsbarcolor":
            this.output(
              "addonColors",
              `bar:${text()}:${num(1)}`,
              color(args[2]!),
            );
            return null;
          case "cpsetrbscolor":
            this.output("addonColors", `${text()}:${num(1)}`, color(args[2]!));
            return null;
          case "cpsettankstand":
          case "cpsettankstand2": {
            const d = sim.drivers[num() - 1];
            if (d) d.fuel = Math.max(0, Math.min(100, num(1)));
            return null;
          }
          case "cpshowsubscreenintervall":
          case "cpshowsubscreen": {
            const key = text(2).replaceAll("\\", "/").toLowerCase();
            const screen = Object.entries(this.pkg?.screens || {}).find(
              ([name]) => name.toLowerCase() === key,
            )?.[1];
            if (!screen) throw Error(`Overlay nicht geladen: ${text(2)}`);
            if (name === "cpshowsubscreenintervall") {
              const existing = sim.overlays.find(
                (o) =>
                  this.blink.get(o.handle)?.owner === owner &&
                  o.source === screen.source &&
                  o.x === num() &&
                  o.y === num(1),
              );
              if (existing) return existing.handle;
            }
            if (sim.overlays.length >= 64) throw Error("Maximal 64 Overlays");
            const handle = ++this.session.handle;
            this.overlayHandles.add(handle);
            sim.overlays.push({
              handle,
              x: num(),
              y: num(1),
              slot,
              hidden: false,
              packageValues: this.packageValues,
              ...screen,
            });
            if (name === "cpshowsubscreenintervall")
              this.blink.set(handle, {
                owner,
                interval: Math.max(10, num(3)),
                start: this.now,
              });
            return handle;
          }
          case "cpclosesubscreen":
            sim.overlays = sim.overlays.filter((o) => o.handle !== num());
            return null;
          case "cpstatussubscreen":
            return sim.overlays.some((o) => o.handle === num()) ? 1 : 0;
          case "cprepaintsubscreen":
            return null;
          case "cpsetmonitor":
            if (num() !== 0)
              this.log(
                `Monitor ${num()} wird auf der einzigen Vorschau dargestellt`,
              );
            return null;
          case "cpaudioevent":
          case "cpshowmessage":
          case "cpspeech":
          case "cpstopandspeech":
          case "cpsound":
            this.log(`${name}: ${text()}`);
            return null;
          case "cpsetoutput":
            this.outputs[text()] = Boolean(args[1]);
            this.log(`Ausgang ${text()}: ${Boolean(args[1])}`);
            return null;
          case "cpsetcuesctaste":
            sim.running = true;
            sim.phase = "race";
            return null;
          case "cpsetcustarttaste":
            sim.running = !sim.running;
            sim.phase = sim.running ? "race" : "chaos";
            return null;
          case "cpsimulatebutton":
            switch (num()) {
              case 1:
                this.session.emit("Startampel", slot, 1);
                sim.running = true;
                sim.phase = "race";
                break;
              case 2:
                this.session.emit("ChangeRealTimeStatus", slot, 9);
                sim.running = false;
                sim.phase = "finish";
                this.lastPhase = "4";
                break;
              case 3:
                sim.running = false;
                sim.phase = "chaos";
                break;
              case 4:
              case 7:
                sim.running = true;
                sim.phase = "race";
                break;
              case 5:
              case 6:
                this.state.mode = num() === 5 ? "T" : "Q";
                sim.running = true;
                sim.phase = "race";
                break;
              case 10:
                sim.running = false;
                sim.phase = "finish";
                break;
              default:
                this.log("UI-Taster ohne Simulator-Ansicht: " + text());
            }
            return null;
          case "cpardcumode":
          case "cpcusimuleertasteoff":
            this.log(`CU-Steuerung simuliert: ${name}(${args.join(", ")})`);
            return null;
          case "cpsetcugeschwwert":
          case "cpsetcugeschwwertfast":
          case "cpresetcugeschwwert": {
            const d = sim.drivers[num() - 1];
            if (d) {
              const speed = name.startsWith("cpreset")
                ? 15
                : Math.max(0, Math.min(15, num(1)));
              if (name.endsWith("fast")) d.cuSpeed = speed;
              else d.pendingCuSpeed = speed;
            }
            return null;
          }
          case "cpsetcubremswert":
          case "cpresetcubremswert": {
            const d = sim.drivers[num() - 1];
            if (d)
              d.pendingCuBrake = name.startsWith("cpreset")
                ? 10
                : Math.max(0, Math.min(15, num(1)));
            return null;
          }
          case "cpgetinput":
            return Boolean(this.variables.get("input:" + text().toLowerCase()));
          case "cpinttolongtimeformat": {
            const ms = Math.abs(num()),
              sign = num() < 0 ? "-" : "";
            return (
              sign +
              String(Math.floor(ms / 3600000)).padStart(2, "0") +
              ":" +
              String(Math.floor(ms / 60000) % 60).padStart(2, "0") +
              ":" +
              String(Math.floor(ms / 1000) % 60).padStart(2, "0") +
              "," +
              String(Math.floor(ms) % 1000).padStart(3, "0")
            );
          }
          case "cpinttostr3":
            return (num() / 1000).toFixed(3).replace(".", ",");
          case "rgb":
            return num() + (num(1) << 8) + (num(2) << 16);
          case "cpslotfontcolor":
            return parseInt(fromCssColor(driver().font), 16);
        }
        throw new UnsupportedPascal(
          `Befehl ${name} wird im Simulator noch nicht unterstützt`,
        );
      },
    };
    return host;
  }
}
export const demoAddon: AddonPackage = {
  name: "RBS-Demo: Texte, Balken und Symbole",
  config: "",
  screens: {
    "DemoOverlay.xml": {
      source:
        '<RennScreen><base><dim xmax="600" ymax="120" bcolor="002B2118" slots="6"/></base><grafik/><texte><text left="15" top="10" fh="18" fc="006BE6B9" text="ADDON · SIMULATION"/></texte><variablen><addonVariable left="15" top="38" nr="0" fh="24" fc="00FFFFFF" addonvariablename="DemoStatus">Status</addonVariable><progressbar left="15" top="80" breite="550" hoehe="20" nr="1" typ="AddonBar" nc="006BE6B9" addonvariablename="DemoTank"/></variablen></RennScreen>',
      assets: {},
    },
  },
  source: `<AddOnClasses><StartRealTime><![CDATA[begin
  cpShowSubScreen(40, 20, 'DemoOverlay.xml');
  cpSetRBSStringVar('DemoStatus', 0, 'AddOn läuft');
  cpSetRBSIntegerVar('DemoTank', 1, 75);
  cpAddOnSymbolEvent('DemoSymbol', 1, True);
end.]]></StartRealTime><StartZiel><![CDATA[begin
  cpSetRBSStringVar('DemoStatus', 0, Cockpit.FahrerName + ': Runde ' + IntToStr(Cockpit.Runde));
  cpSetRBSIntegerVar('DemoTank', Cockpit.Slot, Round(Cockpit.TankStand));
end.]]></StartZiel><ChangeRealTimeStatus><![CDATA[begin
  if Cockpit.Parameter = 6 then cpSetRBSStringVar('DemoStatus', 0, 'Pause');
end.]]></ChangeRealTimeStatus></AddOnClasses>`,
};
