import { toCssColor } from "./xml";
import type { Simulation } from "./simulator";
export interface Snapshot {
  status: Record<string, unknown>;
  drivers: Record<string, unknown>[];
  profiles: Record<string, unknown>[];
  settings?: Record<string, unknown>;
}
const num = (v: unknown) =>
  v === undefined || v === null || v === ""
    ? NaN
    : Number(String(v).replace(",", "."));
export function applySnapshot(s: Simulation, data: Snapshot) {
  if (
    !Array.isArray(data.drivers) ||
    !Array.isArray(data.profiles) ||
    !data.status
  )
    throw Error("Unbekanntes Cockpit-API-Antwortformat");
  const elapsed = num(data.status.rennzeit),
    status = num(data.status.rennstatus);
  if (!Number.isFinite(elapsed) || elapsed < 0 || !Number.isInteger(status))
    throw Error("API liefert keine gültige Rennzeit oder Rennstatus");
  s.elapsed = elapsed / 1000;
  s.enabled = true;
  s.running = false;
  s.liveStatus =
    (
      { 1: "RENNEN", 2: "STARTAMPEL", 6: "PAUSE", 9: "ABGEBROCHEN" } as Record<
        number,
        string
      >
    )[status] ?? `STATUS ${status}`;
  s.phase = status === 1 ? "race" : "chaos";
  const duration = num(data.settings?.sollzeit),
    target = num(data.settings?.sollrennrunden);
  if (duration > 0) s.duration = duration;
  if (target >= 0) s.targetLaps = target;
  for (const row of data.drivers) {
    if (!row || typeof row !== "object") continue;
    const d = s.drivers.find((d) => d.id === num(row.slot));
    if (!d) continue;
    const laps = num(row.runde),
      last = num(row.rundenzeit) / 1000,
      fuel = num(row.tankstand);
    if (
      !Number.isInteger(laps) ||
      laps < 0 ||
      !Number.isFinite(last) ||
      last < 0
    )
      continue;
    if (laps < d.laps) d.history = [];
    if (laps > d.laps && last > 0) {
      d.history.push({
        lap: laps,
        time: last,
        fuel: Number.isFinite(fuel) ? fuel : d.fuel,
      });
      if (d.history.length > 1000) d.history.shift();
    }
    const position = num(row.position);
    d.position =
      position > 0 && Number.isInteger(position) ? position : undefined;
    d.laps = laps;
    d.last = last;
    const best = num(row.schnellsterunde) / 1000;
    if (Number.isFinite(best) && best >= 0) d.best = best;
    if (Number.isFinite(fuel)) d.fuel = Math.max(0, Math.min(100, fuel));
    const profile = data.profiles.find((p) => p && num(p.slot) === d.id);
    if (profile) {
      for (const [key, field] of [
        ["slotfarbeback", "background"],
        ["slotfarbefont", "font"],
      ] as const) {
        const color = num(profile[key]);
        if (Number.isInteger(color) && color >= 0 && color <= 0xffffff)
          d[field] = toCssColor(color.toString(16));
      }
      d.name = String(profile.namefahrer || d.name);
      d.car = String(profile.namefahrzeug || d.car);
    }
  }
}
