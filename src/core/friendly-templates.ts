import { elementXml } from "./catalog";
import { escapeXml, fromCssColor, slotColors } from "./xml";

const designs = [
  {
    id: "polar",
    name: "Polar",
    description: "Weiße Zeitentafel mit blauen Akzenten und klaren Kanten",
    arrangement: "vertical",
    rounded: false,
    maxDrivers: 8,
    palette: ["#edf3fa", "#ffffff", "#deebfc", "#162d4b", "#506580", "#1759a8"],
  },
  {
    id: "sunshine",
    name: "Sonnengelb",
    description: "Warme gelbe Fahrerzeilen mit abgerundeten Flächen",
    arrangement: "vertical",
    rounded: true,
    maxDrivers: 8,
    palette: ["#fff8d9", "#fffef6", "#ffe47b", "#443709", "#70602e", "#795500"],
  },
  {
    id: "mint",
    name: "Minze",
    description: "Luftige mintgrüne Karten mit Zeiten und Tankbalken",
    arrangement: "grid",
    rounded: true,
    maxDrivers: 8,
    palette: ["#eaf8f1", "#ffffff", "#c9efde", "#153e32", "#4c6c60", "#16694d"],
  },
  {
    id: "meadow",
    name: "Grüne Boxengasse",
    description: "Eckige Fahrerzeilen mit Tank, Stopps und Rennübersicht",
    arrangement: "vertical",
    rounded: false,
    maxDrivers: 8,
    palette: ["#edf4e3", "#ffffff", "#d4e8b9", "#263a18", "#5a6e48", "#3a661c"],
  },
  {
    id: "lemon",
    name: "Zitronen-Duell",
    description: "Zwei große, runde Fahrerfelder in Weiß und Zitronengelb",
    arrangement: "horizontal",
    rounded: true,
    maxDrivers: 2,
    palette: ["#f9f7df", "#ffffff", "#f1ed89", "#35391a", "#676b40", "#596500"],
  },
  {
    id: "paper",
    name: "Papierstreifen",
    description: "Schmale weiße Fahrerspalten mit blauen Trennlinien",
    arrangement: "horizontal",
    rounded: false,
    maxDrivers: 6,
    palette: ["#ffffff", "#eff4fa", "#dce7f5", "#24364b", "#53667d", "#225e9c"],
  },
  {
    id: "pistachio",
    name: "Pistazie",
    description: "Runde grüne Fahrerspalten mit großer Rundenzeit",
    arrangement: "horizontal",
    rounded: true,
    maxDrivers: 4,
    palette: ["#f2f6e8", "#ffffff", "#dfedbb", "#303e1f", "#606c4e", "#48651d"],
  },
  {
    id: "lagoon",
    name: "Lagune",
    description: "Hellblaue Kacheln mit geteilten Zeit- und Tankfeldern",
    arrangement: "grid",
    rounded: false,
    maxDrivers: 8,
    palette: ["#eaf5fa", "#ffffff", "#cdeaf0", "#173d4c", "#476d7d", "#116b80"],
  },
  {
    id: "apricot",
    name: "Aprikose",
    description: "Runde Fahrerzeilen in Creme und sanftem Orange",
    arrangement: "vertical",
    rounded: true,
    maxDrivers: 8,
    palette: ["#fff1e6", "#fffcf8", "#ffdabe", "#4a3024", "#7e5e4c", "#985021"],
  },
  {
    id: "gridline",
    name: "Startaufstellung",
    description: "Eckige weiße Karten mit limettengrünen Datenfeldern",
    arrangement: "grid",
    rounded: false,
    maxDrivers: 8,
    palette: ["#f5f7ee", "#ffffff", "#e6efbd", "#303d24", "#606b52", "#53681c"],
  },
  {
    id: "podium",
    name: "Podium",
    description: "Bis zu drei breite Spalten mit großer Positionsanzeige",
    arrangement: "horizontal",
    rounded: false,
    maxDrivers: 3,
    palette: ["#fffaf0", "#ffffff", "#f9e7a4", "#3b3522", "#75694a", "#806006"],
  },
  {
    id: "garden",
    name: "Gartenrennen",
    description: "Sanftgrüne Fahrerzeilen neben einer großen Rennuhr",
    arrangement: "vertical",
    rounded: true,
    maxDrivers: 8,
    palette: ["#eff8ed", "#ffffff", "#d9efcf", "#25432d", "#53725a", "#286d3c"],
  },
] as const;

export const friendlyTemplates = designs.map((t) => ({
  ...t,
  minDrivers: t.id === "lemon" ? 2 : 1,
  tone: "light" as const,
}));
type FriendlyTemplate = (typeof friendlyTemplates)[number];

/** Editable Cockpit primitives: rounded panels are roundbox elements, not images. */
export function createFriendlyTemplate(
  t: FriendlyTemplate,
  width: number,
  height: number,
  slots: number,
) {
  const [bg, panel, tint, ink, muted, accent] = t.palette;
  const graphics: string[] = [],
    texts: string[] = [],
    variables: string[] = [];
  const sx = width / 1920,
    sy = height / 1080,
    sf = Math.min(sx, sy);
  const px = (n: number) => Math.round(n * sx),
    py = (n: number) => Math.round(n * sy);
  const box = (
    x: number,
    y: number,
    w: number,
    h: number,
    color: string = panel,
    rounded = t.rounded,
  ) => {
    const tag = rounded ? "roundbox" : "box";
    graphics.push(
      `<${tag} left="${px(x)}" top="${py(y)}" breite="${Math.max(1, px(w))}" hoehe="${Math.max(1, py(h))}" w="0" c="${fromCssColor(color)}" dc="${fromCssColor(color)}" nr="0" sort="0"/>`,
    );
  };
  const text = (
    label: string,
    x: number,
    y: number,
    size = 20,
    color: string = muted,
  ) =>
    texts.push(
      `<text left="${px(x)}" top="${py(y)}" fh="${Math.max(1, Math.round(size * sf))}" ft="Arial" fs="b" fc="${fromCssColor(color)}" text="${escapeXml(label)}"/>`,
    );
  const value = (
    tag: string,
    slot: number,
    x: number,
    y: number,
    w: number,
    size = 36,
    color: string = ink,
  ) =>
    variables.push(
      elementXml(tag, px(x), py(y), slot)
        .replace('fh="36"', `fh="${Math.max(1, Math.round(size * sf))}"`)
        .replace('fc="00FFFFFF"', `fc="${fromCssColor(color)}"`)
        .replace(
          " left=",
          ` breite="${Math.max(1, px(w))}" hoehe="${Math.max(1, py(size + 8))}" left=`,
        ),
    );
  const fuel = (slot: number, x: number, y: number, w: number, h = 14) =>
    variables.push(
      `<tankbar left="${px(x)}" top="${py(y)}" breite="${Math.max(1, px(w))}" hoehe="${Math.max(1, py(h))}" nr="${slot}" sort="0" lc="${fromCssColor(tint)}" nc="${fromCssColor(accent)}" tc="000060FF" tbtyp="h"/>`,
    );

  box(0, 0, 1920, 10, tint, false);
  text(t.name.toLocaleUpperCase("de-DE"), 48, 36, 52, ink);
  text(`${slots} FAHRER  /  COCKPIT-XP`, 50, 105, 20);
  box(1460, 28, 410, 110, tint);
  value("rennzeit", 0, 1490, 47, 350, 62, accent);
  box(48, 163, 1824, 2, tint, false);
  text("RBS STUDIO", 48, 1034, 18);
  value("status", 0, 1420, 1027, 450, 26, accent);

  if (t.arrangement === "vertical") {
    const rowHeight = Math.min(150, 760 / slots);
    const compact = slots > 6;
    if (t.id === "meadow") {
      box(48, 224, 310, 760, tint);
      text("BOXENGASSE", 72, 255, 30, ink);
      text("RESTZEIT", 72, 355);
      value("restrennzeit", 0, 72, 397, 262, 46, accent);
      text("RENNBAHN", 72, 592);
      value("rennbahn", 0, 72, 630, 262, 25);
      text("TANKEN & STOPPS", 72, 900, 23, ink);
    }
    if (t.id === "garden") {
      box(1250, 224, 622, 760, tint);
      text("ZEIT FÜR EIN RENNEN", 1286, 269, 32, ink);
      text("VERBLEIBENDE ZEIT", 1286, 409, 24);
      value("restrennzeit", 0, 1286, 459, 548, 106, accent);
      text("AUF DER BAHN", 1286, 702, 24);
      value("rennbahn", 0, 1286, 748, 548, 38);
    }
    const headings =
      t.id === "polar"
        ? [
            [158, "FAHRER / FAHRZEUG"],
            [720, "LETZTE RUNDE"],
            [1070, "BESTZEIT"],
            [1440, "RUNDEN"],
            [1650, "TANK %"],
          ]
        : t.id === "sunshine"
          ? [
              [180, "FAHRER"],
              [770, "BESTZEIT"],
              [1170, "RUNDEN"],
              [1410, "TANK"],
            ]
          : t.id === "meadow"
            ? [
                [490, "FAHRER"],
                [1010, "RUNDE"],
                [1300, "TANK"],
                [1720, "STOPPS"],
              ]
            : t.id === "apricot"
              ? [
                  [175, "FAHRER / FAHRZEUG"],
                  [700, "RUNDENZEIT"],
                  [1080, "BESTZEIT"],
                  [1460, "RUNDEN"],
                  [1660, "TANK %"],
                ]
              : [
                  [155, "FAHRER"],
                  [680, "RUNDE"],
                  [975, "RUNDEN"],
                ];
    headings.forEach(([x, label]) => text(String(label), Number(x), 188));
    for (let i = 0; i < slots; i++) {
      const slot = i + 1,
        y = 224 + i * rowHeight,
        h = rowHeight - 12;
      const middle = y + (h - 42) / 2;
      if (t.id === "polar") {
        box(48, y, 1824, h);
        box(48, y, 5, h, slotColors[i]!, false);
        box(66, y + 12, 68, h - 24, tint);
        value("position", slot, 85, middle, 45, 38, accent);
        value("fahrer", slot, 158, y + 11, 500, compact ? 30 : 36);
        value("fahrzeug", slot, 158, y + (compact ? 49 : 57), 500, 22, muted);
        value("rundenzeit", slot, 720, middle, 290, 42);
        value("schnellsterunde", slot, 1070, middle, 300, 42, accent);
        value("runde", slot, 1440, middle, 160, 42);
        value("tankinhalt", slot, 1650, middle, 170, 42);
      } else if (t.id === "sunshine") {
        box(48, y, 1824, h);
        box(64, y + 10, 90, h - 20, tint);
        value("position", slot, 94, middle - 2, 56, 44, accent);
        value("fahrer", slot, 180, middle, 520, 40);
        value("schnellsterunde", slot, 770, middle - 5, 330, 50, accent);
        value("runde", slot, 1170, middle, 170, 40);
        fuel(slot, 1410, middle + 16, 235, 18);
        value("tankinhalt", slot, 1690, middle, 140, 38);
      } else if (t.id === "meadow") {
        box(386, y, 1486, h);
        box(386, y, 7, h, slotColors[i]!, false);
        value("position", slot, 414, middle, 60, 38, accent);
        value("fahrer", slot, 490, middle, 460, 36);
        value("rundenzeit", slot, 1010, middle, 240, 40);
        fuel(slot, 1300, middle + 15, 340, 18);
        value("tankStopps", slot, 1720, middle, 110, 40);
      } else if (t.id === "apricot") {
        box(48, y, 1824, h, i % 2 ? panel : tint);
        value("position", slot, 79, middle - 4, 70, 48, accent);
        value("fahrer", slot, 175, y + 11, 460, compact ? 31 : 37);
        value("fahrzeug", slot, 175, y + (compact ? 49 : 58), 460, 21, muted);
        value("rundenzeit", slot, 700, middle - 3, 320, 48);
        value("schnellsterunde", slot, 1080, middle, 310, 42, accent);
        value("runde", slot, 1460, middle, 150, 40);
        value("tankinhalt", slot, 1660, middle, 160, 40);
      } else {
        box(48, y, 1168, h);
        box(64, y + 12, 64, h - 24, tint);
        value("position", slot, 83, middle, 45, 36, accent);
        value("fahrer", slot, 155, y + 12, 460, 34);
        fuel(slot, 155, y + h - 20, 435, 7);
        value("rundenzeit", slot, 680, middle, 240, 42);
        value("runde", slot, 975, middle, 180, 42, accent);
      }
    }
  } else if (t.arrangement === "horizontal") {
    const gap = 24,
      cw = (1824 - gap * (slots - 1)) / slots;
    const nameSize = Math.min(44, (cw - 48) / 8);
    for (let i = 0; i < slots; i++) {
      const x = 48 + i * (cw + gap),
        slot = i + 1,
        w = cw - 48;
      box(x, 200, cw, 790);
      box(x + 24, 221, cw - 48, 6, slotColors[i]!, false);
      if (t.id === "lemon") {
        box(x + 24, 253, 124, 106, tint);
        value("position", slot, x + 58, 266, 80, 76, accent);
        value("fahrer", slot, x + 180, 277, cw - 208, 48);
        text("LETZTE RUNDE", x + 30, 410, 24);
        value("rundenzeit", slot, x + 30, 460, w, 138, accent);
        text("BESTZEIT", x + 30, 676, 23);
        value("schnellsterunde", slot, x + 30, 721, cw / 2 - 55, 56);
        text("RUNDEN", x + cw / 2 + 20, 676, 23);
        value("runde", slot, x + cw / 2 + 20, 721, cw / 2 - 50, 56);
        text("TANK", x + 30, 865, 23);
        fuel(slot, x + 30, 915, cw - 60, 28);
      } else if (t.id === "paper") {
        text(`SPUR ${slot}`, x + 24, 250, 20, accent);
        value("fahrer", slot, x + 24, 290, w, nameSize);
        const metrics = [
          ["rundenzeit", "LETZTE RUNDE"],
          ["schnellsterunde", "BESTZEIT"],
          ["runde", "RUNDEN"],
          ["position", "POSITION"],
        ];
        metrics.forEach(([tag, label], j) => {
          box(x + 24, 377 + j * 130, w, 2, tint, false);
          text(label!, x + 24, 395 + j * 130, 18);
          value(
            tag!,
            slot,
            x + 24,
            430 + j * 130,
            w,
            Math.min(62, w / 5),
            j === 1 ? accent : ink,
          );
        });
        fuel(slot, x + 24, 940, w, 16);
      } else if (t.id === "pistachio") {
        value("fahrer", slot, x + 24, 260, w, nameSize);
        box(x + 24, 355, w, 220, tint);
        text("RUNDENZEIT", x + 42, 382, 21);
        value(
          "rundenzeit",
          slot,
          x + 42,
          434,
          cw - 84,
          Math.min(100, (cw - 84) / 4.5),
          accent,
        );
        text("BESTZEIT", x + 24, 632, 22);
        value("schnellsterunde", slot, x + 24, 676, w, 58, accent);
        text("RUNDEN", x + 24, 785, 21);
        value("runde", slot, x + 24, 823, w / 2, 54);
        text("PLATZ", x + cw / 2, 785, 21);
        value("position", slot, x + cw / 2, 823, w / 2, 54);
        fuel(slot, x + 24, 945, w, 14);
      } else {
        box(x + 24, 250, w, 235, tint);
        text("POSITION", x + 45, 275, 24);
        value("position", slot, x + 45, 319, cw - 90, 136, accent);
        value("fahrer", slot, x + 24, 532, w, nameSize);
        text("LETZTE RUNDE", x + 24, 627, 23);
        value("rundenzeit", slot, x + 24, 670, w, 80);
        text("BESTZEIT", x + 24, 819, 20);
        value("schnellsterunde", slot, x + 24, 855, w * 0.6, 48, accent);
        text("RUNDEN", x + cw * 0.67, 819, 20);
        value("runde", slot, x + cw * 0.67, 855, cw * 0.33 - 24, 48);
        fuel(slot, x + 24, 953, w, 10);
      }
    }
  } else {
    const columns = slots <= 4 ? Math.min(slots, 2) : slots <= 6 ? 3 : 4;
    const rows = Math.ceil(slots / columns),
      gap = 24;
    const cw = (1824 - gap * (columns - 1)) / columns;
    const ch = Math.min(390, (790 - gap * (rows - 1)) / rows);
    for (let i = 0; i < slots; i++) {
      const x = 48 + (i % columns) * (cw + gap),
        y = 200 + Math.floor(i / columns) * (ch + gap),
        slot = i + 1;
      box(x, y, cw, ch);
      box(x + 20, y + 18, 5, 42, slotColors[i]!, false);
      if (t.id === "mint") {
        value("position", slot, x + 40, y + 22, 55, 34, accent);
        value(
          "fahrer",
          slot,
          x + 110,
          y + 24,
          cw - 134,
          Math.min(34, (cw - 134) / 8),
        );
        box(x + 22, y + 91, cw - 44, 119, tint);
        text("LETZTE RUNDE", x + 38, y + 105, 18);
        value("rundenzeit", slot, x + 38, y + 139, cw - 76, 64, accent);
        text("BESTZEIT", x + 24, y + ch - 132, 18);
        value(
          "schnellsterunde",
          slot,
          x + 24,
          y + ch - 102,
          cw * 0.58 - 35,
          38,
        );
        text("RUNDEN", x + cw * 0.62, y + ch - 132, 18);
        value("runde", slot, x + cw * 0.62, y + ch - 102, cw * 0.38 - 24, 38);
        fuel(slot, x + 24, y + ch - 30, cw - 48, 10);
      } else if (t.id === "lagoon") {
        value(
          "fahrer",
          slot,
          x + 40,
          y + 26,
          cw - 64,
          Math.min(36, (cw - 64) / 8),
        );
        box(x + 22, y + 90, (cw - 54) / 2, 135, tint);
        text("RUNDE", x + 34, y + 107, 18);
        value(
          "rundenzeit",
          slot,
          x + 34,
          y + 148,
          (cw - 78) / 2,
          Math.min(46, (cw - 78) / 10),
          accent,
        );
        text("RUNDEN", x + cw / 2 + 16, y + 107, 18);
        value("runde", slot, x + cw / 2 + 16, y + 148, cw / 2 - 38, 52);
        text("TANK %", x + 24, y + ch - 133, 18);
        value(
          "tankinhalt",
          slot,
          x + 24,
          y + ch - 102,
          cw / 2 - 36,
          40,
          accent,
        );
        text("STOPPS", x + cw / 2 + 16, y + ch - 133, 18);
        value(
          "tankStopps",
          slot,
          x + cw / 2 + 16,
          y + ch - 102,
          cw / 2 - 38,
          40,
        );
        fuel(slot, x + 24, y + ch - 31, cw - 48, 12);
      } else {
        box(x + 22, y + 20, 76, 65, tint);
        value("position", slot, x + 45, y + 28, 48, 45, accent);
        value(
          "fahrer",
          slot,
          x + 120,
          y + 34,
          cw - 144,
          Math.min(35, (cw - 144) / 8),
        );
        text("RUNDEN", x + 24, y + 124, 19);
        value("runde", slot, x + 24, y + 159, cw * 0.4 - 30, 63);
        text("LETZTE RUNDE", x + cw * 0.43, y + 124, 18);
        value(
          "rundenzeit",
          slot,
          x + cw * 0.43,
          y + 166,
          cw * 0.57 - 24,
          Math.min(48, (cw * 0.57 - 24) / 5),
        );
        box(x + 22, y + ch - 130, cw - 44, 108, tint);
        text("PERSÖNLICHE BESTZEIT", x + 38, y + ch - 118, 18);
        value(
          "schnellsterunde",
          slot,
          x + 38,
          y + ch - 85,
          cw - 76,
          48,
          accent,
        );
      }
    }
  }

  return `<?xml version="1.0" encoding="iso-8859-1"?>\r\n<RennScreen>\r\n  <base><dim xmax="${width}" ymax="${height}" bcolor="${fromCssColor(bg)}" bimage="" fahrerposfix="1" slots="${slots}" sorttraining="0" fontsizefaktor="100"/><defaults ft="Arial"/></base>\r\n  <grafik>\r\n    ${graphics.join("\r\n    ")}\r\n  </grafik>\r\n  <texte>\r\n    ${texts.join("\r\n    ")}\r\n  </texte>\r\n  <variablen>\r\n    ${variables.join("\r\n    ")}\r\n  </variablen>\r\n</RennScreen>\r\n`;
}
