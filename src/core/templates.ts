import { elementXml } from "./catalog";
import { fromCssColor, slotColors } from "./xml";
import { createDesignedTemplate } from "./template-layouts";
export const templates = [
  {
    id: "race",
    name: "Club Race",
    description: "Fahrerzeilen mit Fahrzeug, Rundenzeit und Tank",
  },
  {
    id: "timing",
    name: "Timing Pro",
    description: "Breite Zeitentabelle mit Abstand zum Vordermann",
  },
  {
    id: "qualifying",
    name: "Qualifying",
    description: "Bestzeiten im Mittelpunkt, dazu aktuelle Runde",
  },
  {
    id: "endurance",
    name: "Langstrecke",
    description: "Restzeit, Tankbalken und Tankstopps pro Fahrer",
  },
  {
    id: "minimal",
    name: "Großanzeige",
    description: "Wenige große Werte für gute Lesbarkeit auf Distanz",
  },
  {
    id: "cards",
    name: "Fahrer-Karten",
    description: "Kachelraster mit einer eigenen Karte je Fahrer",
  },
  {
    id: "pitwall",
    name: "Boxenmauer",
    description: "Senkrechte Spalten für den direkten Fahrervergleich",
  },
  {
    id: "broadcast",
    name: "Race TV",
    description: "Zeit und Rennstatus links, kompakte Fahrerliste rechts",
  },
  {
    id: "duel",
    name: "Duell",
    description: "Zwei gegenüberliegende Spalten mit Fahrerfeldern",
  },
  {
    id: "telemetry",
    name: "Boxenmonitor",
    description: "Kacheln mit Tank, Stopps und Boxenstrafe",
  },
  {
    id: "light",
    name: "Tageslicht",
    description: "Helle Ergebnistafel mit dunkler Schrift und Zeitspalte",
  },
  {
    id: "retro",
    name: "Retro Timing",
    description: "Bernsteinfarbene Zeittafel mit Spur und Rundenzahl",
  },
  {
    id: "blank",
    name: "Leere Arbeitsfläche",
    description: "Dein Design, von Grund auf",
  },
] as const;
export type TemplateKind = (typeof templates)[number]["id"];
export function createTemplate(
  kind: TemplateKind,
  width = 1920,
  height = 1080,
  slots = 6,
) {
  width = Math.max(1, Math.min(16384, Math.round(width) || 1920));
  height = Math.max(1, Math.min(16384, Math.round(height) || 1080));
  slots = Math.max(1, Math.min(8, Math.round(slots) || 6));
  if (kind !== "blank" && kind !== "race")
    return createDesignedTemplate(kind, width, height, slots);
  const graphics: string[] = [],
    texts: string[] = [],
    variables: string[] = [];
  if (kind === "race") {
    const sx = width / 1920,
      sy = height / 1080,
      sf = Math.min(sx, sy);
    const box = (x: number, y: number, w: number, h: number, c: string) =>
      `<box left="${Math.round(x * sx)}" top="${Math.round(y * sy)}" breite="${Math.round(w * sx)}" hoehe="${Math.round(h * sy)}" w="0" c="${fromCssColor(c)}" dc="${fromCssColor(c)}" nr="0" sort="0"/>`;
    const text = (
      str: string,
      x: number,
      y: number,
      size: number,
      color = "#edf3f5",
    ) =>
      `<text left="${Math.round(x * sx)}" top="${Math.round(y * sy)}" fh="${Math.max(1, Math.round(size * sf))}" ft="Arial" fs="b" fc="${fromCssColor(color)}" text="${str}"/>`;
    const fieldWidths: Record<string, number> = {
      position: 80,
      fahrer: 650,
      fahrzeug: 650,
      runde: 160,
      rundenzeit: 300,
      schnellsterunde: 250,
      tankinhalt: 120,
      rennzeit: 320,
      status: 390,
    };
    const variable = (
      tag: string,
      x: number,
      y: number,
      slot: number,
      size: number,
      color = "#edf3f5",
    ) =>
      elementXml(tag, Math.round(x * sx), Math.round(y * sy), slot)
        .replace(
          " left=",
          ` breite="${Math.max(1, Math.round((fieldWidths[tag] ?? 200) * sx))}" hoehe="${Math.max(1, Math.round((size + 8) * sy))}" left=`,
        )
        .replace('fh="36"', `fh="${Math.max(1, Math.round(size * sf))}"`)
        .replace('fc="00FFFFFF"', `fc="${fromCssColor(color)}"`);
    graphics.push(
      box(0, 0, 1920, 8, "#b9e66b"),
      box(40, 190, 1840, 2, "#34404a"),
    );
    texts.push(
      text("CLUB RACE", 44, 42, 55),
      text("LIVE TIMING / DIGITAL 132", 46, 114, 20, "#8b9ca7"),
    );
    variables.push(variable("rennzeit", 1560, 42, 0, 65, "#b9e66b"));
    const columns = [
      [60, "POS"],
      [180, "FAHRER / FAHRZEUG"],
      [880, "RUNDEN"],
      [1110, "LETZTE RUNDE"],
      [1450, "BESTZEIT"],
      [1720, "TANK"],
    ] as const;
    for (const [x, t] of columns) texts.push(text(t, x, 218, 20, "#8b9ca7"));
    const rowHeight = Math.min(118, 700 / slots);
    for (let i = 0; i < slots; i++) {
      const y = 266 + i * rowHeight;
      graphics.push(
        box(40, y, 1840, rowHeight - 10, "#1c2630"),
        box(40, y, 5, rowHeight - 10, slotColors[i]!),
      );
      variables.push(
        variable("position", 68, y + 23, i + 1, 40),
        variable("fahrer", 180, y + (slots > 6 ? 10 : 15), i + 1, 33),
        variable(
          "fahrzeug",
          180,
          y + (slots > 6 ? 51 : 59),
          i + 1,
          slots > 6 ? 17 : 19,
          "#8b9ca7",
        ),
        variable("runde", 912, y + 23, i + 1, 40),
        variable("rundenzeit", 1110, y + 23, i + 1, 40),
        variable("schnellsterunde", 1450, y + 25, i + 1, 36, "#b9e66b"),
        variable("tankinhalt", 1740, y + 25, i + 1, 33),
      );
    }
    texts.push(text("RBS STUDIO", 44, 1030, 19, "#8b9ca7"));
    variables.push(variable("status", 1490, 1026, 0, 24, "#b9e66b"));
  }
  return `<?xml version="1.0" encoding="iso-8859-1"?>\r\n<RennScreen>\r\n  <base>\r\n    <dim xmax="${width}" ymax="${height}" bcolor="001B1510" bimage="" fahrerposfix="1" slots="${slots}" sorttraining="0" fontsizefaktor="100"/>\r\n    <defaults ft="Arial"/>\r\n  </base>\r\n  <grafik>\r\n    ${graphics.join("\r\n    ")}\r\n  </grafik>\r\n  <texte>\r\n    ${texts.join("\r\n    ")}\r\n  </texte>\r\n  <variablen>\r\n    ${variables.join("\r\n    ")}\r\n  </variablen>\r\n</RennScreen>\r\n`;
}
