import { driverFor, type Simulation } from "./simulator";
import type { XmlNode } from "./xml";
export const bindingKey = (n: XmlNode) =>
  `${n.attrs.addonvariablename || n.tag}:${n.attrs.nr || 0}`;
export function symbolVisible(n: XmlNode, s: Simulation) {
  if (!s.enabled) return true;
  if (n.id in s.symbols) return s.symbols[n.id];
  const symbolKey = `${n.attrs.symboladdonname}:${Number(n.attrs.nr) === 0 ? 0 : driverFor(n, s).id}`;
  if (symbolKey in s.addonSymbols) return s.addonSymbols[symbolKey];
  const d = driverFor(n, s),
    on = Number(n.attrs.audioid_ein),
    off = Number(n.attrs.audioid_aus);
  for (const [name, mapping] of Object.entries(s.symbolMappings)) {
    const value = s.addonSymbols[`${name}:${d.id}`];
    if (
      value !== undefined &&
      ((mapping.on > 0 && on === mapping.on && off === mapping.off) ||
        n.attrs.symboladdonname?.toLowerCase() === name)
    )
      return value;
  }
  if (on === 32 && off === 33) return d.pit;
  return s.events[`${d.id}:${on}`] ?? false;
}
export function fireEvent(
  s: Simulation,
  nodes: XmlNode[],
  slot: number,
  event: number,
) {
  if (!Number.isInteger(event) || event <= 0) return;
  s.events[`${slot}:${event}`] = true;
  for (const n of nodes.filter((n) => n.tag === "symbole_einaus")) {
    if (Number(n.attrs.nr) !== 0 && driverFor(n, s).id !== slot) continue;
    if (Number(n.attrs.audioid_ein) === event) s.symbols[n.id] = true;
    if (Number(n.attrs.audioid_aus) === event) s.symbols[n.id] = false;
  }
}
export function barPercent(n: XmlNode, s: Simulation) {
  if (!s.enabled) return 100;
  const override = s.barValues[bindingKey(n)];
  const d = driverFor(n, s);
  let value =
    override ??
    (n.tag === "progressbar" && n.attrs.typ?.toLowerCase() === "addonbar"
      ? Number(
          s.addonValues[
            `${n.attrs.addonvariablename}:${Number(n.attrs.nr) === 0 ? 0 : d.id}`
          ] ?? 0,
        )
      : undefined) ??
    (n.tag === "tankbar"
      ? d.fuel
      : n.attrs.typ === "rennzeit"
        ? Number(n.attrs.nr) === 0
          ? 100 - (s.elapsed / s.duration) * 100
          : (s.elapsed / s.duration) * 100
        : n.attrs.typ?.startsWith("strafe")
          ? (d.penalty / 30) * 100
          : 0);
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}
export function gridColumns(n: XmlNode, nodes: XmlNode[]) {
  const start = nodes.indexOf(n),
    result: XmlNode[] = [];
  for (const c of nodes.slice(start + 1)) {
    if (c.tag !== "datagrid") continue;
    if (!c.attrs.variable) break;
    if (c.attrs.nr === n.attrs.nr) result.push(c);
  }
  return result;
}
export function gridCell(
  variable: string,
  row: { lap: number; time: number; fuel: number },
  mst = 1,
) {
  const values: Record<string, string> = {
    runde: String(row.lap),
    rundenzeit: row.time.toFixed(3),
    tankinhalt: row.fuel.toFixed(0),
    tank1000: row.fuel.toFixed(3),
    sektorzeit: (row.time / 3).toFixed(3),
    zwischenzeit: ((row.time * Math.max(1, Math.min(3, mst))) / 3).toFixed(3),
  };
  return (values[variable] ?? "—").replace(".", ",");
}

export function withGridColumns(ids: number[], nodes: XmlNode[]) {
  const all = new Set(ids);
  for (const n of nodes)
    if (all.has(n.id) && n.tag === "datagrid" && !n.attrs.variable)
      for (const c of gridColumns(n, nodes)) all.add(c.id);
  return [...all];
}
