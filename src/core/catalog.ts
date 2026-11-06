export const catalog = [
  ["datagrid", "Runden-Tabelle", "Renndaten"],
  ["text", "Text", "Gestaltung"],
  ["box", "Fläche", "Gestaltung"],
  ["rechteck", "Rahmen", "Gestaltung"],
  ["roundbox", "Runde Fläche", "Gestaltung"],
  ["linie", "Linie", "Gestaltung"],
  ["bitmap", "Bild", "Gestaltung"],
  ["fahrer", "Fahrername", "Fahrer"],
  ["fahrersn", "Fahrerkürzel", "Fahrer"],
  ["fahrzeug", "Fahrzeug", "Fahrer"],
  ["position", "Position", "Fahrer"],
  ["slot", "Spur / ID", "Fahrer"],
  ["bildfahrer", "Fahrerbild", "Fahrer"],
  ["bildfahrzeug", "Fahrzeugbild", "Fahrer"],
  ["runde", "Rundenzahl", "Renndaten"],
  ["rundenzeit", "Rundenzeit", "Renndaten"],
  ["schnellsterunde", "Beste Runde", "Renndaten"],
  ["histrundenzeit", "Rundenhistorie", "Renndaten"],
  ["abstand", "Abstand", "Renndaten"],
  ["sektorzeit", "Sektorzeit", "Renndaten"],
  ["rennzeit", "Rennzeit", "Renndaten"],
  ["restrennzeit", "Restzeit", "Renndaten"],
  ["status", "Rennstatus", "Renndaten"],
  ["rennbahn", "Rennbahn", "Renndaten"],
  ["tankinhalt", "Tank in Prozent", "Tanken"],
  ["tankbar", "Tankbalken", "Tanken"],
  ["tankStopps", "Tankstopps", "Tanken"],
  ["boxenstrafe", "Boxenstrafe", "Tanken"],
  ["addonVariable", "AddOn-Variable", "AddOn"],
  ["symbole_einaus", "Ereignissymbol", "AddOn"],
  ["progressbar", "Fortschrittsbalken", "AddOn"],
] as const;
export function label(tag: string) {
  return catalog.find((c) => c[0] === tag)?.[1] ?? tag;
}
export function sectionFor(tag: string) {
  return tag === "text"
    ? "texte"
    : [
          "box",
          "rechteck",
          "roundbox",
          "roundrechteck",
          "linie",
          "bitmap",
        ].includes(tag)
      ? "grafik"
      : "variablen";
}
export function elementXml(tag: string, x = 100, y = 100, slot = 1) {
  if (tag === "datagrid")
    return `<datagrid nr="${slot}" left="${x}" top="${y}" breite="420" hoehe="260">Spur ${slot}</datagrid><datagrid nr="${slot}" variable="runde" len="60">Runde</datagrid><datagrid nr="${slot}" variable="rundenzeit" len="100" nks="3">Rundenzeit</datagrid><datagrid nr="${slot}" variable="tankinhalt" len="80">Tank</datagrid>`;
  if (tag === "text")
    return `<text left="${x}" top="${y}" fh="32" ft="Arial" fs="b" fc="00FFFFFF" text="Neuer Text"/>`;
  if (["box", "rechteck", "roundbox", "roundrechteck", "linie"].includes(tag))
    return `<${tag} left="${x}" top="${y}" breite="300" hoehe="${tag === "linie" ? 0 : 80}" nr="0" sort="0" w="2" c="00312A22" dc="005B4E3F" addonvariablename=""/>`;
  if (tag === "bitmap")
    return `<bitmap left="${x}" top="${y}" breite="240" hoehe="160" file="" tc="0"/>`;
  if (tag.startsWith("bild"))
    return `<${tag} left="${x}" top="${y}" breite="160" hoehe="100" nr="${slot}" sort="0" option="" addonvariablename=""/>`;
  if (tag === "symbole_einaus")
    return `<symbole_einaus left="${x}" top="${y}" breite="64" hoehe="64" symbolname="" nr="${slot}" sort="0" audioid_ein="0" audioid_aus="0" transcolor="0" symboladdonname=""/>`;
  if (tag === "tankbar" || tag === "progressbar")
    return `<${tag} ${tag === "progressbar" ? 'typ="AddonBar"' : ""} left="${x}" top="${y}" breite="200" hoehe="22" nr="${slot}" sort="0" lc="00312A22" nc="00ABD55C" tc="0057CDF8" opt1c="00000000" tbtyp="h" option="" addonvariablename=""/>`;
  const example: Record<string, string> = {
    fahrer: "Fahrername",
    fahrersn: "MAX",
    fahrzeug: "Porsche 911 GT3",
    runde: "00",
    position: "1",
    slot: String(slot),
    rundenzeit: "00,000",
    schnellsterunde: "00,000",
    rennzeit: "00:00",
    restrennzeit: "10:00",
    tankinhalt: "100",
    status: "RENNEN",
    rennbahn: "Meine Rennbahn",
    addonVariable: "Vorschautext",
  };
  return `<${tag} left="${x}" top="${y}" nr="${slot}" nks="${tag.includes("zeit") || tag === "schnellsterunde" ? 3 : 0}" mst="0" len="0" prefix="" post="" sort="0" go="0" fh="36" ft="Arial" fs="b" fc="00FFFFFF" fcn="00000000" fdc="000000FF" fa="left" option="" addonvariablename="${tag === "addonVariable" ? "MeineVariable" : ""}">${example[tag] ?? "0"}</${tag}>`;
}
