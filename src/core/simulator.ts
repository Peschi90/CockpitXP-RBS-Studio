import { reactive } from "vue";
import { slotColors, slotTextColors, type XmlNode } from "./xml";
export interface PitPenalty {
  duration: number;
  remaining: number;
  deadline: number;
  deduction: number;
  disqualify: boolean;
  endLaps: number;
  fuelAfter: boolean;
}
export interface Driver {
  id: number;
  name: string;
  car: string;
  laps: number;
  last: number;
  best: number;
  fuel: number;
  progress: number;
  bestLap: number;
  lapElapsed: number;
  lapTargetMs: number;
  drawRemaining: number;
  drawSwaps: Map<number, number>;
  fueledThisVisit: boolean;
  penaltiesIssued: number;
  stops: number;
  pit: boolean;
  position?: number;
  history: { lap: number; time: number; fuel: number }[];
  readonly penalty: number;
  readonly boxPenalty: PitPenalty | null;
  boxPenalties: PitPenalty[];
  keyPenaltyRemaining: number;
  refuelWait: number;
  refuelWaitDuration: number;
  tankLocked: boolean;
  pitFuelBlocked: boolean;
  disqualified: boolean;
  cuSpeed: number;
  cuBrake: number;
  pendingCuSpeed: number | null;
  pendingCuBrake: number | null;
  pictures: Record<string, string>;
  background: string;
  font: string;
}
const names = [
  "Max Weber",
  "Lena Fischer",
  "Tom Berger",
  "Sophie Klein",
  "Jan Richter",
  "Mia Wagner",
  "Alex Wolf",
  "Ben König",
];
const cars = [
  "Porsche 911 GT3 R",
  "BMW M4 GT3",
  "Ferrari 296 GT3",
  "Mercedes-AMG GT3",
  "Audi R8 LMS",
  "Lamborghini Huracán",
  "McLaren 720S",
  "Aston Martin Vantage",
];
export function createSimulation() {
  return reactive({
    live: false,
    liveStatus: "",
    targetLaps: 100,
    activeSlots: 8,
    lapMinMs: 8000,
    lapMaxMs: 9500,
    fuelPerLap: 2,
    refuelDelay: 3,
    running: false,
    enabled: true,
    elapsed: 0,
    speed: 1,
    duration: 600,
    reserve: 20,
    dynamicSlot: 1,
    symbolMappings: {
      motorschaden: { on: 73, off: 74 },
      bremsschaden: { on: 75, off: 76 },
      customer1: { on: 0, off: 0 },
      customer2: { on: 0, off: 0 },
      customer3: { on: 0, off: 0 },
    } as Record<string, { on: number; off: number }>,
    packageValues: {} as Record<string, string | number>,
    addonValues: {} as Record<string, string | number>,
    addonSymbols: {} as Record<string, boolean>,
    addonColors: {} as Record<string, string>,
    overlays: [] as {
      packageValues?: Record<string, string | number>;
      slot?: number;
      hidden?: boolean;
      handle: number;
      x: number;
      y: number;
      source: string;
      assets: Record<string, string>;
    }[],
    resetId: 0,
    events: {} as Record<string, boolean>,
    symbols: {} as Record<string, boolean>,
    barValues: {} as Record<string, number>,
    barColors: {} as Record<string, string>,
    phase: "race" as "race" | "chaos" | "safety" | "finish",
    drivers: names.map((name, i): Driver => ({
      id: i + 1,
      name,
      get boxPenalty() {
        return this.boxPenalties[0] ?? null;
      },
      get penalty() {
        return this.boxPenalties.reduce(
          (sum, p) => sum + p.remaining,
          this.keyPenaltyRemaining,
        );
      },
      car: cars[i]!,
      laps: 0,
      last: 8.3 + i * 0.21,
      best: 8.1 + i * 0.2,
      fuel: 100,
      progress: 0,
      bestLap: 0,
      lapElapsed: 0,
      lapTargetMs: 0,
      drawRemaining: 0,
      drawSwaps: new Map<number, number>(),
      fueledThisVisit: false,
      penaltiesIssued: 0,
      stops: 0,
      pit: false,
      history: [],
      boxPenalties: [],
      keyPenaltyRemaining: 0,
      refuelWait: 0,
      refuelWaitDuration: 0,
      pitFuelBlocked: false,
      tankLocked: false,
      disqualified: false,
      cuSpeed: 15,
      cuBrake: 10,
      pendingCuSpeed: null,
      pendingCuBrake: null,
      pictures: {},
      background: slotColors[i]!,
      font: slotTextColors[i]!,
    })),
    overrides: {} as Record<string, string>,
  });
}
export type Simulation = ReturnType<typeof createSimulation>;
// Each slot draws from its own millisecond values, shuffled without replacement.
function nextLapTarget(sim: Simulation, driver: Driver) {
  const first = sim.lapMinMs + driver.id - 1;
  const count = Math.floor((sim.lapMaxMs - first) / 8) + 1;
  if (!driver.drawRemaining) {
    driver.drawRemaining = count;
    driver.drawSwaps.clear();
  }
  const remaining = driver.drawRemaining;
  let index = Math.floor(Math.random() * remaining);
  const valueAt = (i: number) => first + 8 * (driver.drawSwaps.get(i) ?? i);
  if (remaining === count && valueAt(index) === driver.lapTargetMs)
    index = (index + 1) % remaining;
  const target = valueAt(index);
  driver.drawSwaps.set(
    index,
    driver.drawSwaps.get(remaining - 1) ?? remaining - 1,
  );
  driver.drawSwaps.delete(remaining - 1);
  driver.drawRemaining--;
  return target;
}
export function configureLapTimes(sim: Simulation, min: number, max: number) {
  if (sim.live) return false;
  const lo = Math.round(min * 1000),
    hi = Math.round(max * 1000);
  if (
    !Number.isSafeInteger(lo) ||
    !Number.isSafeInteger(hi) ||
    lo < 1000 ||
    hi > 3600000 ||
    hi - lo < 15
  )
    return false;
  if (lo === sim.lapMinMs && hi === sim.lapMaxMs) return true;
  sim.lapMinMs = lo;
  sim.lapMaxMs = hi;
  for (const d of sim.drivers) {
    d.drawRemaining = 0;
    d.drawSwaps.clear();
    if (d.progress === 0) d.lapTargetMs = 0;
  }
  return true;
}
export function issuePitPenalty(sim: Simulation, d: Driver, seconds: number) {
  if (
    sim.live ||
    sim.phase === "finish" ||
    d.disqualified ||
    !Number.isFinite(seconds) ||
    seconds <= 0 ||
    seconds > 3600
  )
    return;
  d.boxPenalties.push({
    duration: seconds,
    remaining: seconds,
    deadline: Infinity,
    deduction: 0,
    disqualify: false,
    endLaps: 0,
    fuelAfter: true,
  });
  d.penaltiesIssued++;
}
export function togglePit(sim: Simulation, d: Driver) {
  if (sim.live || sim.phase === "finish" || d.disqualified) return;
  if (d.pit) {
    if (d.boxPenalty) d.boxPenalty.remaining = d.boxPenalty.duration;
    if (d.refuelWait > 0) d.refuelWait = d.refuelWaitDuration;
  }
  d.pit = !d.pit;
  d.pitFuelBlocked = false;
  d.fueledThisVisit = false;
}
function enforceDeadline(d: Driver) {
  const laps = d.laps;
  for (let i = d.boxPenalties.length - 1; i >= 0; i--) {
    const p = d.boxPenalties[i]!;
    if (laps <= p.deadline) continue;
    d.laps = Math.max(0, d.laps - p.deduction);
    d.disqualified ||= p.disqualify;
    d.boxPenalties.splice(i, 1);
  }
}
function drive(sim: Simulation, d: Driver, seconds: number) {
  if (!d.lapTargetMs) d.lapTargetMs = nextLapTarget(sim, d);
  while (seconds > 0 && !d.disqualified) {
    const pace = d.cuSpeed / 15 / (sim.phase === "safety" ? 1.7 : 1);
    if (pace <= 0) {
      d.lapElapsed += seconds;
      return;
    }
    const lapTime = d.lapTargetMs / (1000 * pace);
    const toLine = (1 - d.progress) * lapTime;
    if (seconds + 1e-9 < toLine) {
      d.progress += seconds / lapTime;
      d.lapElapsed += seconds;
      return;
    }
    seconds -= toLine;
    d.laps++;
    d.last = Math.round((d.lapElapsed + toLine) * 1000) / 1000;
    if (!d.bestLap || d.last < d.best) {
      d.best = d.last;
      d.bestLap = d.laps;
    }
    d.fuel = Math.max(0, d.fuel - sim.fuelPerLap);
    d.history.push({ lap: d.laps, time: d.last, fuel: d.fuel });
    if (d.history.length > 1000) d.history.shift();
    d.progress = 0;
    d.lapElapsed = 0;
    d.lapTargetMs = nextLapTarget(sim, d);
    if (d.pendingCuBrake !== null) {
      d.cuBrake = d.pendingCuBrake;
      d.pendingCuBrake = null;
    }
    enforceDeadline(d);
    if (d.pendingCuSpeed !== null) {
      d.cuSpeed = d.pendingCuSpeed;
      d.pendingCuSpeed = null;
    }
  }
}
export function refuelCountdownPercent(d: Driver): number | null {
  if (!d.pit || d.boxPenalty || d.refuelWait <= 0) return null;
  return (100 * d.refuelWait) / d.refuelWaitDuration;
}

function servicePit(sim: Simulation, d: Driver, seconds: number) {
  d.lapElapsed += seconds;
  while (d.boxPenalty) {
    const p = d.boxPenalty;
    const served = Math.min(seconds, p.remaining);
    seconds -= served;
    p.remaining = Math.round((p.remaining - served) * 1e9) / 1e9;
    if (p.remaining > 0) return;
    d.boxPenalties.shift();
    d.pitFuelBlocked ||= !p.fuelAfter;
    if (!d.boxPenalty) {
      d.refuelWaitDuration = d.pitFuelBlocked ? 0 : sim.refuelDelay;
      d.refuelWait = d.refuelWaitDuration;
    }
  }
  if (d.pitFuelBlocked) return;
  const waited = Math.min(seconds, d.refuelWait);
  d.refuelWait = Math.round((d.refuelWait - waited) * 1e9) / 1e9;
  seconds -= waited;
  if (seconds <= 0 || d.tankLocked || d.fuel >= 100) return;
  if (!d.fueledThisVisit) d.stops++;
  d.fueledThisVisit = true;
  d.fuel = Math.min(100, d.fuel + seconds * 8);
}
export function tick(sim: Simulation, dt: number) {
  if (!sim.live && sim.phase === "finish")
    for (const d of sim.drivers)
      if (d.boxPenalty) {
        const deduction = d.boxPenalties.reduce((sum, p) => sum + p.endLaps, 0);
        d.laps = Math.max(0, d.laps - deduction);
        d.boxPenalties.length = 0;
      }
  if (
    sim.live ||
    !sim.running ||
    sim.phase === "chaos" ||
    sim.phase === "finish"
  )
    return;
  const seconds = dt * sim.speed;
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  sim.elapsed += seconds;
  for (const d of sim.drivers.slice(0, sim.activeSlots)) {
    if (!d.pit) enforceDeadline(d);
    if (d.disqualified) continue;
    if (d.pit) {
      servicePit(sim, d, seconds);
      continue;
    }
    d.fueledThisVisit = false;
    d.pitFuelBlocked = false;
    d.keyPenaltyRemaining = Math.max(0, d.keyPenaltyRemaining - seconds);
    drive(sim, d, seconds);
  }
}
export function resetSimulation(sim: Simulation) {
  sim.resetId++;
  sim.elapsed = 0;
  sim.phase = "race";
  sim.running = false;
  for (const d of sim.drivers)
    Object.assign(d, {
      laps: 0,
      last: 8.3 + d.id * 0.19,
      best: 8.1 + d.id * 0.2,
      fuel: 100,
      progress: 0,
      bestLap: 0,
      lapElapsed: 0,
      lapTargetMs: 0,
      drawRemaining: 0,
      drawSwaps: new Map<number, number>(),
      fueledThisVisit: false,
      penaltiesIssued: 0,
      stops: 0,
      pit: false,
      history: [],
      boxPenalties: [],
      keyPenaltyRemaining: 0,
      refuelWait: 0,
      refuelWaitDuration: 0,
      pitFuelBlocked: false,
      tankLocked: false,
      disqualified: false,
      cuSpeed: 15,
      cuBrake: 10,
      pendingCuSpeed: null,
      pendingCuBrake: null,
    });
  sim.events = {};
  sim.symbols = {};
  sim.barValues = {};
  sim.barColors = {};
  sim.overrides = {};
}
export function ranked(sim: Simulation) {
  return [...sim.drivers].sort((a, b) =>
    sim.live
      ? (a.position ?? 99) - (b.position ?? 99)
      : b.laps + b.progress - (a.laps + a.progress),
  );
}
export function driverFor(n: XmlNode, sim: Simulation) {
  if (Number(n.attrs.nr) === -1) return ranked(sim)[0]!;
  const slot =
    Number(n.attrs.nr) === -2
      ? sim.dynamicSlot
      : Math.max(1, Math.min(8, Number(n.attrs.nr) || 1));
  return n.attrs.sort === "1" ? ranked(sim)[slot - 1]! : sim.drivers[slot - 1]!;
}
export function timeText(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
export function raceTime(seconds: number, n: XmlNode) {
  const value = Math.max(0, seconds),
    places = Math.max(0, Math.min(3, Number(n.attrs.nks) || 0));
  if (n.attrs.option === "h")
    return `${Math.floor(value / 3600)
      .toString()
      .padStart(2, "0")}:${timeText(value % 3600)}`;
  const factor = 10 ** places,
    rounded = Math.floor(value * factor) / factor;
  return (
    timeText(rounded) +
    (places
      ? "," +
        Math.floor((rounded % 1) * factor + 0.00001)
          .toString()
          .padStart(places, "0")
      : "")
  );
}
export const simulatedTags = new Set([
  "datagrid",
  "durchschnrundenzeit",
  "diffletzterunde",
  "diffschnellsterunde",
  "diffdurchschnrundenzeit",
  "abstandrdvordermann",
  "abstandzeitvordermann",
  "zeitstrafe",
  "tankVerbrauchProRunde",
  "tankverbrauchprorunde",
  "diffschnellsterunde2",
  "reglerid",
  "zwischenzeit",
  "text",
  "fahrer",
  "fahrerln",
  "fahrersn",
  "fahrzeug",
  "fahrzeugln",
  "runde",
  "rundenzeit",
  "rundenzeitlauf",
  "schnellsterunde",
  "schnellsterunderd",
  "position",
  "slot",
  "rennzeit",
  "restrennzeit",
  "fahrzeit",
  "sollrennzeit",
  "sollrennrunden",
  "restrunden",
  "tank1000",
  "tankinhalt",
  "tankStopps",
  "tankstopps",
  "tankbar",
  "status",
  "rennmodus",
  "rennmodusbase",
  "rennbahn",
  "rennbahnln",
  "datum",
  "abstand",
  "abstandzeit",
  "abstandrd",
  "addonVariable",
  "boxenstrafe",
  "histrundenzeit",
  "sektorzeit",
]);
export function displayText(n: XmlNode, sim: Simulation) {
  if (n.tag === "text") return n.attrs.text ?? n.text;
  if (!sim.enabled) return n.text.trim() || n.tag;
  const override =
    sim.overrides[`${n.attrs.addonvariablename || n.tag}:${n.attrs.nr || 0}`] ??
    (n.attrs.addonvariablename
      ? sim.overrides[n.attrs.addonvariablename]
      : undefined);
  if (override !== undefined) return override;
  const d = driverFor(n, sim),
    decimals = Math.max(0, Math.min(6, Number(n.attrs.nks) || 0));
  const decimal = (v: number, places = decimals) =>
    v.toFixed(places).replace(".", ",");
  if (
    [
      "scriptVariable",
      "scriptVariablePackage",
      "cp_StringVar",
      "cp_FloatVar",
      "cp_IntegerVar",
    ].includes(n.tag)
  ) {
    const key = (
        n.attrs.option ||
        n.attrs.addonvariablename ||
        n.text
      ).toLowerCase(),
      value = sim.packageValues[key] ?? sim.packageValues[key + d.id];
    if (value !== undefined)
      return `${n.attrs.prefix ?? ""}${typeof value === "number" ? decimal(value) : value}${n.attrs.post ?? ""}`;
  }
  const addon = n.attrs.addonvariablename;
  const addonValue = addon
    ? sim.addonValues[`${addon}:${Number(n.attrs.nr) === 0 ? 0 : d.id}`]
    : undefined;
  if (addonValue !== undefined && n.tag === "addonVariable")
    return `${n.attrs.prefix ?? ""}${typeof addonValue === "number" ? decimal(addonValue) : addonValue}${n.attrs.post ?? ""}`;
  let value: string | undefined;
  switch (n.tag) {
    case "fahrer":
    case "fahrerln":
      value = d.name;
      break;
    case "fahrersn":
      value = d.name
        .split(" ")
        .map((x) => x[0])
        .join("");
      break;
    case "fahrzeug":
    case "fahrzeugln":
      value = d.car;
      break;
    case "runde":
      value = String(d.laps);
      break;
    case "rundenzeit":
      value = decimal(d.last);
      break;
    case "rundenzeitlauf":
      value = decimal(sim.live ? d.progress * d.last : d.lapElapsed);
      break;
    case "schnellsterunde":
      value = decimal(d.best);
      break;
    case "schnellsterunderd":
      value = String(sim.live ? Math.max(1, d.laps - 2) : d.bestLap);
      break;
    case "position":
      value = String(ranked(sim).findIndex((x) => x.id === d.id) + 1);
      break;
    case "slot":
      value = String(d.id);
      break;
    case "rennzeit":
    case "fahrzeit":
      value = raceTime(sim.elapsed, n);
      break;
    case "restrennzeit":
      value = raceTime(Math.max(0, sim.duration - sim.elapsed), n);
      break;
    case "sollrennzeit":
      value = raceTime(sim.duration, n);
      break;
    case "sollrennrunden":
      value = String(sim.targetLaps);
      break;
    case "restrunden":
      value = String(Math.max(0, sim.targetLaps - d.laps));
      break;
    case "tank1000":
    case "tankinhalt":
      value = decimal(d.fuel);
      break;
    case "tankStopps":
    case "tankstopps":
      value = String(d.stops);
      break;
    case "status":
      value = sim.live
        ? sim.liveStatus
        : (
            {
              race: "RENNEN",
              chaos: "CHAOS",
              safety: "SAFETY CAR",
              finish: "ZIEL",
            } as const
          )[sim.phase];
      break;
    case "rennmodus":
    case "rennmodusbase":
      value = "Rennen";
      break;
    case "rennbahn":
    case "rennbahnln":
      value = "Club Raceway";
      break;
    case "datum":
      value = new Date().toLocaleDateString("de-DE");
      break;
    case "abstand":
    case "abstandzeit":
      value = decimal(
        Math.max(
          0,
          (ranked(sim)[0]!.laps +
            ranked(sim)[0]!.progress -
            d.laps -
            d.progress) *
            d.last,
        ),
        3,
      );
      break;
    case "abstandrd":
      value = String(ranked(sim)[0]!.laps - d.laps);
      break;
    case "histrundenzeit":
      {
        const index = Math.max(1, Math.min(20, Number(n.attrs.mst) || 1)),
          option = n.attrs.option || "";
        const row = option.startsWith("S")
          ? [...d.history].sort((a, b) => a.time - b.time)[index - 1]
          : d.history.at(-index);
        value = row
          ? option.includes("R#")
            ? String(row.lap)
            : option.includes("Z#")
              ? decimal(row.time)
              : `${row.lap} / ${decimal(row.time)}`
          : "";
      }
      break;
    case "sektorzeit":
      value = decimal(d.last / 3, 3);
      break;
    case "boxenstrafe":
      value = d.boxPenalty
        ? (d.pit ? "Strafe " : "Boxenstrafe ") +
          Math.ceil(d.boxPenalty.remaining) +
          " s"
        : d.pit
          ? "BOX"
          : "";
      break;
    case "addonVariable":
      value =
        sim.overrides[n.attrs.addonvariablename ?? ""] ??
        (n.attrs.addonvariablename === "PC_StatusText"
          ? sim.phase === "safety"
            ? "SAFETY CAR - Runde " + (Math.floor(sim.elapsed / 15) + 1)
            : ""
          : n.text.trim());
      break;
  }
  if (value === undefined) {
    const times = d.history.map((r) => r.time),
      average = times.length
        ? times.reduce((a, b) => a + b, 0) / times.length
        : d.last;
    const previous =
      ranked(sim)[
        Math.max(0, ranked(sim).findIndex((x) => x.id === d.id) - 1)
      ]!;
    const derived: Record<string, string> = {
      durchschnrundenzeit: decimal(average),
      diffletzterunde: decimal(d.last - (times.at(-2) ?? d.last)),
      diffschnellsterunde: decimal(d.last - d.best),
      diffdurchschnrundenzeit: decimal(d.last - average),
      abstandrdvordermann: String(Math.max(0, previous.laps - d.laps)),
      abstandzeitvordermann: decimal(
        Math.max(
          0,
          (previous.laps + previous.progress - d.laps - d.progress) * d.last,
        ),
      ),
      zeitstrafe: decimal(d.penalty),
      tankVerbrauchProRunde: decimal(sim.live ? d.last * 0.18 : sim.fuelPerLap),
      tankverbrauchprorunde: decimal(sim.live ? d.last * 0.18 : sim.fuelPerLap),
      diffschnellsterunde2: decimal(
        d.best - Math.min(...sim.drivers.map((d) => d.best)),
      ),
      reglerid: String(d.id),
      zwischenzeit: decimal(
        (d.last * Math.max(1, Math.min(3, Number(n.attrs.mst) || 1))) / 3,
      ),
    };
    value = derived[n.tag];
  }
  return value === undefined
    ? n.text.trim() || n.tag
    : `${n.attrs.prefix ?? ""}${value}${n.attrs.post ?? ""}`;
}
