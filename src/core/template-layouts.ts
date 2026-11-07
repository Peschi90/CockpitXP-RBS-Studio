import { elementXml } from "./catalog";
import { escapeXml, fromCssColor, slotColors } from "./xml";
import type { TemplateKind } from "./templates";

/** Native RBS primitives only: no external images, fonts, or AddOns required. */
export function createDesignedTemplate(
  kind: Exclude<TemplateKind, "race" | "blank">,
  width: number,
  height: number,
  slots: number,
) {
  const graphics: string[] = [],
    texts: string[] = [],
    variables: string[] = [];
  const sx = width / 1920,
    sy = height / 1080,
    sf = Math.min(sx, sy);
  const light = kind === "light",
    retro = kind === "retro";
  const bg = light ? "#edf1f5" : retro ? "#17130c" : "#101820";
  const panel = light ? "#ffffff" : retro ? "#241e10" : "#1c2a38";
  const ink = light ? "#142638" : retro ? "#ffcc70" : "#f0f5fa";
  const muted = light ? "#53677c" : retro ? "#b69a62" : "#a4b7c8";
  const accent = light
    ? "#006bb3"
    : retro
      ? "#ffb62e"
      : kind === "qualifying"
        ? "#d6a3ff"
        : kind === "endurance" || kind === "telemetry"
          ? "#65dfba"
          : "#74c8ff";
  const font = retro ? "Consolas" : "Arial";
  const box = (x: number, y: number, w: number, h: number, color = panel) =>
    graphics.push(
      `<box left="${Math.round(x * sx)}" top="${Math.round(y * sy)}" breite="${Math.max(1, Math.round(w * sx))}" hoehe="${Math.max(1, Math.round(h * sy))}" w="0" c="${fromCssColor(color)}" dc="${fromCssColor(color)}" nr="0" sort="0"/>`,
    );
  const text = (
    value: string,
    x: number,
    y: number,
    size = 22,
    color = muted,
  ) =>
    texts.push(
      `<text left="${Math.round(x * sx)}" top="${Math.round(y * sy)}" fh="${Math.max(1, Math.round(size * sf))}" ft="${font}" fs="b" fc="${fromCssColor(color)}" text="${escapeXml(value)}"/>`,
    );
  const value = (
    tag: string,
    slot: number,
    x: number,
    y: number,
    w: number,
    size = 36,
    color = ink,
  ) => {
    variables.push(
      elementXml(tag, Math.round(x * sx), Math.round(y * sy), slot)
        .replace('fh="36"', `fh="${Math.max(1, Math.round(size * sf))}"`)
        .replace('ft="Arial"', `ft="${font}"`)
        .replace('fc="00FFFFFF"', `fc="${fromCssColor(color)}"`)
        .replace(
          " left=",
          ` breite="${Math.max(1, Math.round(w * sx))}" hoehe="${Math.max(1, Math.round((size + 8) * sy))}" left=`,
        ),
    );
  };
  const fuel = (slot: number, x: number, y: number, w: number, h = 20) =>
    variables.push(
      `<tankbar left="${Math.round(x * sx)}" top="${Math.round(y * sy)}" breite="${Math.max(1, Math.round(w * sx))}" hoehe="${Math.max(1, Math.round(h * sy))}" nr="${slot}" sort="0" lc="${fromCssColor(bg)}" nc="${fromCssColor(accent)}" tc="000060FF" tbtyp="h"/>`,
    );
  const names: Record<typeof kind, string> = {
    timing: "TIMING PRO",
    qualifying: "QUALIFYING",
    endurance: "LANGSTRECKE",
    minimal: "LIVE RACE",
    cards: "FAHRER-KARTEN",
    pitwall: "BOXENMAUER",
    broadcast: "RACE TV",
    duel: "DUELL",
    telemetry: "BOXENMONITOR",
    light: "CLUB ERGEBNISSE",
    retro: "RETRO TIMING",
  };
  box(0, 0, 1920, 8, accent);
  text(names[kind], 44, 35, 50, ink);
  text(`${slots} FAHRER / COCKPIT-XP`, 46, 100, 20);
  if (kind !== "broadcast")
    value(
      kind === "endurance" || kind === "qualifying"
        ? "restrennzeit"
        : "rennzeit",
      0,
      1510,
      35,
      360,
      64,
      accent,
    );
  box(40, 156, 1840, 2, accent);
  text("RBS STUDIO", 44, 1032, 18);
  if (kind !== "broadcast") value("status", 0, 1390, 1026, 490, 26, accent);

  // Different column structures and field priorities, not just colour variants.
  type Column = [
    tag: string,
    label: string,
    x: number,
    w: number,
    size?: number,
  ];
  function table(columns: Column[], rowStart = 232, rowSpace = 750) {
    columns.forEach(([, label, x]) => text(label, x, 190, 21));
    const rh = Math.min(150, rowSpace / slots);
    for (let i = 0; i < slots; i++) {
      const y = rowStart + i * rh,
        slot = i + 1;
      box(40, y, 1840, rh - 10);
      box(40, y, 5, rh - 10, slotColors[i]!);
      for (const [tag, , x, w, size = 38] of columns) {
        if (tag === "tankbar") fuel(slot, x, y + (rh - 32) / 2, w, 22);
        else
          value(
            tag,
            slot,
            x,
            y + (rh - size - 10) / 2,
            w,
            size,
            tag === "schnellsterunde" ? accent : ink,
          );
      }
    }
  }
  if (kind === "timing")
    table([
      ["position", "POS", 64, 90],
      ["fahrer", "FAHRER", 185, 430],
      ["runde", "RUNDEN", 670, 150],
      ["rundenzeit", "LETZTE RUNDE", 880, 260, 47],
      ["schnellsterunde", "BESTZEIT", 1200, 260, 47],
      ["abstand", "ABSTAND", 1530, 310],
    ]);
  if (kind === "qualifying")
    table([
      ["position", "POS", 64, 90],
      ["fahrer", "FAHRER", 190, 470],
      ["schnellsterunde", "PERSÖNLICHE BESTZEIT", 740, 460, 68],
      ["rundenzeit", "LETZTE RUNDE", 1270, 300, 44],
      ["runde", "RUNDEN", 1650, 190],
    ]);
  if (kind === "endurance")
    table([
      ["position", "POS", 64, 90],
      ["fahrer", "FAHRER", 185, 390],
      ["runde", "RUNDEN", 625, 150],
      ["rundenzeit", "RUNDE", 820, 250],
      ["tankbar", "TANK", 1130, 370],
      ["tankinhalt", "%", 1540, 130],
      ["tankStopps", "STOPPS", 1730, 110],
    ]);
  if (kind === "minimal")
    table([
      ["position", "POS", 64, 130, 62],
      ["fahrer", "FAHRER", 260, 720, 58],
      ["runde", "RUNDEN", 1080, 260, 62],
      ["rundenzeit", "RUNDENZEIT", 1420, 420, 62],
    ]);
  if (kind === "light")
    table([
      ["position", "PLATZ", 64, 100, 48],
      ["fahrer", "FAHRER", 220, 500, 44],
      ["fahrzeug", "FAHRZEUG", 780, 480, 30],
      ["runde", "RUNDEN", 1320, 170, 48],
      ["schnellsterunde", "BESTZEIT", 1550, 300, 48],
    ]);
  if (kind === "retro")
    table([
      ["slot", "SPUR", 64, 100, 40],
      ["fahrersn", "NAME", 240, 300, 54],
      ["runde", "LAPS", 650, 220, 54],
      ["rundenzeit", "LAP TIME", 950, 350, 54],
      ["schnellsterunde", "BEST LAP", 1460, 380, 54],
    ]);
  if (kind === "cards" || kind === "telemetry" || kind === "duel") {
    const columns =
      kind === "duel"
        ? Math.min(2, slots)
        : Math.min(slots, slots > 6 ? 4 : slots > 2 ? 3 : 2);
    const rows = Math.ceil(slots / columns),
      cw = (1840 - (columns - 1) * 22) / columns;
    const ch = Math.min(390, (810 - (rows - 1) * 20) / rows);
    for (let i = 0; i < slots; i++) {
      const x = 40 + (i % columns) * (cw + 22),
        y = 186 + Math.floor(i / columns) * (ch + 20),
        slot = i + 1;
      box(x, y, cw, ch);
      box(x, y, cw, 6, slotColors[i]!);
      if (kind === "duel") {
        value("position", slot, x + 20, y + 25, 100, 60, accent);
        value("fahrer", slot, x + 145, y + 18, cw - 165, 38);
        value("rundenzeit", slot, x + 145, y + 70, cw / 2 - 145, 48);
        value("runde", slot, x + cw / 2 + 20, y + 70, cw / 2 - 40, 48);
        text("RUNDE / RUNDEN", x + 145, y + ch - 32, 18);
      } else if (kind === "telemetry") {
        value("fahrer", slot, x + 20, y + 25, cw - 40, 35);
        text("TANK %", x + 20, y + 82, 18);
        value("tankinhalt", slot, x + 20, y + 111, cw / 2 - 30, 60, accent);
        text("STOPPS", x + cw / 2, y + 82, 18);
        value("tankStopps", slot, x + cw / 2, y + 111, cw / 2 - 20, 60);
        fuel(slot, x + 20, y + ch - 105, cw - 40, 22);
        text("STRAFE", x + 20, y + ch - 60, 18);
        value("boxenstrafe", slot, x + cw / 2, y + ch - 62, cw / 2 - 20, 28);
      } else {
        value("position", slot, x + 20, y + 25, 70, 38, accent);
        value("fahrer", slot, x + 100, y + 25, cw - 120, 35);
        text("LETZTE RUNDE", x + 20, y + 94, 18);
        value("rundenzeit", slot, x + 20, y + 126, cw - 40, 68);
        text("RUNDEN", x + 20, y + ch - 108, 18);
        value("runde", slot, x + 20, y + ch - 79, cw / 2 - 30, 38);
        text("BESTZEIT", x + cw / 2, y + ch - 108, 18);
        value(
          "schnellsterunde",
          slot,
          x + cw / 2,
          y + ch - 79,
          cw / 2 - 20,
          34,
          accent,
        );
        fuel(slot, x + 20, y + ch - 23, cw - 40, 6);
      }
    }
  }
  if (kind === "pitwall") {
    const gap = 16,
      cw = (1840 - (slots - 1) * gap) / slots,
      size = Math.min(42, (cw - 32) / 5);
    for (let i = 0; i < slots; i++) {
      const x = 40 + i * (cw + gap),
        slot = i + 1;
      box(x, 190, cw, 800);
      box(x, 190, cw, 8, slotColors[i]!);
      text(`SPUR ${slot}`, x + 16, 220, 22);
      value(
        "fahrersn",
        slot,
        x + 16,
        270,
        cw - 32,
        Math.min(64, cw / 3),
        accent,
      );
      const metrics: [string, string][] = [
        ["position", "POSITION"],
        ["runde", "RUNDEN"],
        ["rundenzeit", "RUNDE"],
        ["schnellsterunde", "BESTZEIT"],
        ["tankinhalt", "TANK %"],
      ];
      metrics.forEach(([tag, label], j) => {
        text(label, x + 16, 385 + j * 105, 20);
        value(tag, slot, x + 16, 415 + j * 105, cw - 32, size);
      });
      fuel(slot, x + 16, 948, cw - 32, 20);
    }
  }
  if (kind === "broadcast") {
    box(40, 190, 480, 800);
    text("RENNZEIT", 70, 230, 24);
    value("rennzeit", 0, 70, 280, 420, 100, accent);
    text("RENNSTATUS", 70, 475, 24);
    value("status", 0, 70, 525, 420, 42);
    text("RESTZEIT", 70, 700, 24);
    value("restrennzeit", 0, 70, 750, 420, 74, accent);
    const rh = 800 / slots;
    for (let i = 0; i < slots; i++) {
      const y = 190 + i * rh,
        slot = i + 1;
      box(548, y, 1332, rh - 12);
      box(548, y, 6, rh - 12, slotColors[i]!);
      value("position", slot, 570, y + 20, 95, 52, accent);
      value("fahrer", slot, 700, y + 16, 570, 36);
      value("fahrzeug", slot, 700, y + 59, 570, 22, muted);
      value("runde", slot, 1315, y + 25, 155, 42);
      value("rundenzeit", slot, 1515, y + 25, 330, 48);
    }
  }
  return `<?xml version="1.0" encoding="iso-8859-1"?>\r\n<RennScreen>\r\n  <base><dim xmax="${width}" ymax="${height}" bcolor="${fromCssColor(bg)}" bimage="" fahrerposfix="1" slots="${slots}" sorttraining="0" fontsizefaktor="100"/><defaults ft="${font}"/></base>\r\n  <grafik>\r\n    ${graphics.join("\r\n    ")}\r\n  </grafik>\r\n  <texte>\r\n    ${texts.join("\r\n    ")}\r\n  </texte>\r\n  <variablen>\r\n    ${variables.join("\r\n    ")}\r\n  </variablen>\r\n</RennScreen>\r\n`;
}
