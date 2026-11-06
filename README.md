# RBS Studio

Eigenständiger Windows-Editor für Cockpit-XP-Rennbildschirme. Version **0.4.1 Preview**. Schwerpunkt: vorhandene RBS bearbeiten und ihre XML-Struktur erhalten. Keine Installation in Cockpit-XP erforderlich.

## Korrekturen in 0.4.1

- Die Bibliothek überspringt Cockpits automatisch erzeugten `ConvertRBS`-Cache. Eigene Varianten bleiben erhalten; der Cache kann bei Bedarf ausdrücklich als Bibliotheksordner ausgewählt werden. Es werden keine Dateien gelöscht.
- Die Windows-App misst Schriften über GDI: positive/negative VCL-Fonthöhe, interne Schriftabstände, Grundlinie, tatsächliche Feldbreite und Windows-Ersatzschrift. CSS-Schätzwerte (`fh * 1.24`, Grundlinie `fh * 0.94`) entfallen. Die reine Browser-Vorschau verwendet weiterhin näherungsweise Browser-Schriftmaße.
- Zentrierte/rechtsbündige Variablen orientieren sich am gespeicherten Platzhalter. `len` ersetzt vorhandene Zahlen- und Zeitformate nicht mehr durch eine Folge Nullen. Feldgrenzen bleiben bei wechselnden Simulationswerten stabil; Variablen werden an ihren Feldgrenzen abgeschnitten.
- Textausrichtung auf die Bildschirmmitte nutzt die gemessene Feldbreite statt einer pauschalen Breite von 140 Pixeln.
- Das Koordinatenattribut `links` bei `symbole_einaus` wird gelesen und beim Verschieben in dieser Schreibweise erhalten.
- Bitmaps ohne explizite Abmessungen verwenden ihre natürliche Bildgröße. Beim Verschieben werden keine geschätzten Endkoordinaten in die XML geschrieben.
- Im Modus **Originaltexte anzeigen** gelten die Slot-Standardfarben (`fdc` / `dc`) des Designers. Flächen und Rahmen verwenden die Zeichenfarbe `c`; `dc` ist keine separate Rahmenfarbe. Balken werden wie in der Cockpit-Designansicht voll dargestellt.

Abgleich: Nutzer-Screenshot des Cockpit-Designers mit `cockpit/6 Fahrer/Cp-6S-07 Rennen 1920x1080/Rennen.xml`. Native Windows-Maße: Arial Fett `9999`, fh=96 → Feld 184 × 96, Grundlinie 77, em=83; `MMM`, fh=72 → 159 × 72; `120:00`, fh=160 → 432 × 160. Automatisierte UI-Prüfungen speisen die auf diesem Windows-System gemessenen GDI-Werte ein und prüfen die unveränderte XML-Datei. Ein vollständiger Vergleich jedes Bildpixels ist damit nicht behauptet: WebView2/SVG und Cockpit können sich in Kantenglättung unterscheiden, und Cockpits interne Fahrer-/Fahrzeug-Demobilder sind nicht Teil der RBS-Datei.

Technische Grundlagen: [Cockpit-RennDesigner, Platzhalter und Fonthöhe](https://wiki.cockpit-xp.de/xpdashboard/smart-xp/cp/CpXP-Doku-RennDesigner.pdf), [VCL Font.Height](https://docwiki.embarcadero.com/Libraries/Athens/en/Vcl.Graphics.TFont.Height), [Windows CreateFont](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-createfontw).

## Starten

Im Ordner `release/0.4.1` liegt `RBS Studio.exe` zum direkten Start. Alternativ installiert `RBS Studio_0.4.1_x64-setup.exe` die Anwendung für den aktuellen Windows-Benutzer. Die Anwendung verwendet Microsoft Edge WebView2; der Installer kann eine fehlende Laufzeit nachinstallieren. Die EXE ist nicht digital signiert.

1. **Öffnen** wählt eine `Rennen.xml`, `Startampel.xml`, einen anderen Rennbildschirm oder ein RBS-Overlay aus.
2. Der Bibliothek-Reiter durchsucht zunächst `C:\ProgramData\Cockpit-V2\RennBildschirm`. Über **Ordner wählen** lässt sich ein anderes Datenverzeichnis auswählen.
3. Elemente auf der Arbeitsfläche oder in der Ebenenliste auswählen. Eigenschaften rechts bearbeiten oder Elemente ziehen.
4. **Speichern unter** ist über den Pfeil neben **Speichern** oder `Strg+Umschalt+S` erreichbar. Für eine eigenständige Kopie einen neuen, leeren RBS-Ordner wählen und die Datei z. B. `Rennen.xml` nennen.
5. Den gespeicherten Bildschirm anschließend in Cockpit-XP öffnen und die Darstellung kontrollieren.

## Bearbeiten

- Visuelle Arbeitsfläche mit Zoom, Einpassen, Raster und Einrasten auf 8 Pixel. Alt beim Ziehen übergeht das Raster.
- Texte, Variablen, Flächen, Rahmen, Linien, Bilder, Symbole und Balken auswählen und bearbeiten.
- Umschalt/Ctrl + Klick für Mehrfachauswahl; gemeinsam verschieben, duplizieren, löschen oder ausrichten.
- Pfeiltasten bewegen um 1 Pixel, mit Umschalt um 10 Pixel.
- Größenanfasser an Formen und Bildern; exakte Koordinaten und Maße im Eigenschaftenbereich.
- Schrift, Größe, Fett/Kursiv, Ausrichtung, Farbe, Spur, Sortierung und AddOn-Name bearbeiten.
- Die Schaltfläche **Für weitere Spur kopieren** kopiert eine Auswahl mit neuer Spur-ID und vertikalem Abstand. AddOn-Namen werden unverändert kopiert; doppelte Namen werden als Prüfhinweis angezeigt.
- **Alle XML-Attribute** und der XML-Editor ermöglichen den Zugriff auf Eigenschaften ohne eigenen Bedienregler.
- Rückgängig/Wiederholen mit `Strg+Z`, `Strg+Y` bzw. `Strg+Umschalt+Z` (bis zu 80 Schritte).
- Neue RBS: leere Arbeitsfläche oder anpassbare Club-Race-Vorlage für 1–8 Fahrer, mit frei wählbarer Auflösung bis 16384 × 16384.

Die Ebenen bleiben in den ursprünglichen Cockpit-Sektionen `grafik`, `texte` und `variablen`. Eine beliebige Verschiebung zwischen diesen Sektionen ist nicht vorgesehen. Der XML-Editor kann die Quellreihenfolge bearbeiten.

## Speichern und Wiederherstellen

- Unbearbeitete XML-Bereiche werden nicht neu serialisiert. Attribute werden gezielt im ursprünglichen Quelltext geändert. Kommentare, unbekannte Elemente, unbekannte Attribute, Unterelemente und die ursprünglichen Koordinatenvarianten bleiben erhalten.
- Bei unverändertem Speichern bleibt die Datei byteidentisch; es wird keine unnötige Sicherung erzeugt.
- Beim Überschreiben einer geänderten Datei wird der vorherige Inhalt als `<Dateiname>.rbs-studio-<Zeitstempel>.bak` im selben Ordner gesichert. Die neue XML wird zunächst in eine temporäre Datei geschrieben, synchronisiert und anschließend ersetzt.
- Ein SHA-256-Vergleich erkennt Änderungen oder Löschung seit dem Öffnen. In diesem Fall wird das Überschreiben abgebrochen. Die Änderung lässt sich unter einem anderen Namen sichern.
- UTF-8 (auch mit BOM), ISO-8859-1 und Windows-1252 werden unterstützt. Die XML-Deklaration bestimmt die Ausgabecodierung. Zeichen außerhalb des gewählten Legacy-Zeichensatzes werden als XML-Zeichenreferenzen geschrieben. UTF-16 wird mit einer verständlichen Fehlermeldung abgewiesen.
- **Speichern unter** kopiert die durch `bimage`, `file` und `symbolname` referenzierten Bilder mit. Vorhandene Bilder mit anderem Inhalt, fehlende Bilder oder nicht portable Bildpfade führen zum Abbruch der Kopie. Andere XML-Bildschirmdateien, Startampeln, Vorschau-JPGs und AddOns werden nicht automatisch mitkopiert.
- Bilder lassen sich nach dem ersten Speichern importieren. Dabei wird kein vorhandenes anderes Bild überschrieben. Originale Cockpit-Formate PNG, JPEG und BMP sind zu bevorzugen.
- Ein lokaler Wiederherstellungsstand wird bei Änderungen nach 500 ms gespeichert. Beim nächsten Start lässt sich dieser Stand wiederherstellen. Er ersetzt nicht das explizite Speichern der XML-Datei.
- Vor Öffnen/Neuanlage/Schließen bei ungespeicherten Änderungen erscheint eine Rückfrage.

Die Anwendung arbeitet lokal. Nur bei ausdrücklich gestarteter Live-Verbindung fragt sie die angegebene Cockpit-Adresse ab; Rennbildschirmdateien werden nicht übertragen. Sie verändert keine Cockpit-Datenbank, AddOn-Skripte oder Hardwarekonfiguration.

## Simulator und Vorschau

Der integrierte Simulator liefert Beispielwerte für Fahrer, Fahrzeuge, Runden, Rundenzeiten, Bestzeiten, Tank, Rennstatus, Abstände, Sektorzeiten und ausgewählte weitere Variablen. Renntempo 1×, 2×, 5× und 10×; Rennen, Chaos, Safety Car, Zieleinlauf; Boxenstopps mit Nachtanken. Ausgewählte AddOn-Textvariablen lassen sich manuell mit einem Vorschauwert belegen. Die Simulation ändert die XML-Datei nicht.

### Neu in 0.4: Erweiterte AddOn-Simulation

1. **Simulator → Erweiterte Simulation → AddOn-Ausführung** öffnen.
2. In der Windows-App **Installierte AddOns suchen** verwenden oder **AddOn laden…** wählen. Die Anwendung liest `AddOn.cps.xml`, `ConfigPackage.xml`, bis zu 32 RBS-Overlays und bis zu 64 Textdateien aus dem Paketordner. Quellen und Konfigurationen bleiben unverändert. Der Import akzeptiert auch das bei deinem Joker-Dialog vorgefundene XML mit `AddOn` als Wurzelelement.
3. Konfiguration und Rennmodus vor dem Start einstellen. **AddOn starten** aktiviert das ausgewählte Paket. Bis zu acht Pakete können gleichzeitig geladen und gestartet werden. Über die Paket-Schaltflächen zwischen ihren Einstellungen und Ergebnissen wechseln.
4. Runden, Boxenein-/ausfahrt und Rennstatus erzeugen automatisch Ereignisse. Weitere Ereignisse mit Spur, Parameter und **Sensor / Station** auslösen. Eingänge lassen sich umschalten; Y, J und L stehen als Schnellzugriff für Aufzeichnung, Joker-Dialog und Chaos-Test bereit.
5. Dialoge erscheinen als schließbare Fenster mit funktionierenden Pascal-Callbacks. Diagramme zeigen aufgezeichnete Runden. Virtuelle Excel-/Datenbanktabellen und Textdateien lassen sich ansehen und explizit exportieren.

Die Laufzeit unterstützt nun feste und dynamische Arrays einschließlich mehrerer Dimensionen, Array- und Listenindizes, `case` mit Bereichen, Zeichen wie `#13#10`, Ganzzahl-Bitoperationen, Referenzparameter, Prozedur-Callbacks und zusätzliche String-/Formatfunktionen. Vorhandene Schleifen, Routinen, `Result`, `Exit`, `Break`, `Continue` und `try/except/finally` bleiben unterstützt. `cpSleep` und Eingangspolling laufen kooperativ. Kritische Abschnitte können schlafen; andere Ereignisse warten auf ihre Freigabe. Grenzen für Skriptschritte, Speicher und Aufruftiefe bleiben aktiv.

Zusätzliche Cockpit-Funktionen umfassen Rennmodus/-status, Zielrunden/-zeit, Abstände, Gesamtzeit, Sensorstation, Slotfarben als Referenzausgabe, Boxenstrafen, Strafabbruch, Tastenstrafe, Tankensperre, CU-Geschwindigkeits-/Bremswerte, simulierte Rennsteuerung sowie dynamische und blinkende Subscreens. Reguläres Rennende meldet Status 3/4. `cpGetRacingStatus` liefert R/S/P; T/Q/R gehören zu `cpGetRacingMode`. Boxen-Standzeiten werden als Zehntelsekunden interpretiert und im Simulator in der Box abgebaut. Die Tastenstrafe ist als eigene Simulationsvorgabe einstellbar; sie wird nicht aus dem Cockpit-StartCenter importiert. CU-Werte wirken bei der nächsten Start/Ziel-Überfahrt, die Fast-Geschwindigkeitsvariante sofort. Der Geschwindigkeitswert beeinflusst das vereinfachte Fahrmodell; der Bremswert wird als Zustand geführt.

Package-Variablen sind getrennt; `cp*VarG` und das virtuelle Dateisystem sind zwischen gleichzeitig laufenden Paketen geteilt. Relative Pfade wie `..\Pace-Car-Handling\SCU-Phase.txt` funktionieren zwischen nativ geladenen Paketen. Overlays erhalten ihre eigenen Package-Werte; `scriptVariablePackage`/`scriptVariable` und dynamische Spur `nr="-2"` werden dargestellt. Beim Stoppen eines Pakets bleiben die Ausgaben der anderen Pakete erhalten, soweit diese unter eigenen Namen geschrieben wurden. Bei identischen RBS-Variablennamen gilt die letzte Ausgabe.

`TStringList` und `TFileStream` arbeiten ausschließlich auf virtuellen Dateien. `TForm`, `TButton`, `TLabel`, `TChart` und `TLineSeries` werden in der Vorschau nachgebildet. `CreateOleObject('Excel.Application')` liefert eine virtuelle Tabelle, und `TADOQuery.ExecSQL` unterstützt die einfache `INSERT INTO … VALUES`-Form des installierten Access-Demos als virtuelle Datentabelle. Es startet weder Office noch eine Datenbankverbindung. Sprache, Sound und Audioereignisse erscheinen im Protokoll. Skripte haben keinen direkten Zugriff auf Dateisystem, Betriebssystem, Netzwerk oder Hardware.

**Prüfung:** 28 lokal installierte Pakete mit 79 ausführbaren Ereignisskripten wurden eingelesen und in einem gemeinsamen Testszenario pro Paket ausgeführt. Zwei zusätzliche XML-Konfigurationsblöcke des Joker-AddOns enthalten keinen ausführbaren Pascal-Code. Der maschinenlesbare Bericht liegt unter `reports/addon-compatibility.json`; der verständliche Prüfbericht liegt bei der Windows-Ausgabe. Zusätzlich wurden originale Pace-Car-Abläufe, Joker-Plus/Minus-Callbacks, Regenbeginn/-ende, CU-Werte und die gegenseitige Sperre zwischen Regen- und Schadenssimulation geprüft. Die Prüfung bestätigt diese Abläufe, keine vollständige Zweigabdeckung oder Gleichheit mit der Cockpit-Laufzeit.

**Verbleibende Grenzen:** keine kompilierten `.ilc`-Dateien, eigenen Klassen/Records, DLLs, beliebigen COM-Objekte, allgemeine SQL-Abfragen oder vollständige VCL-/TeeChart-Nachbildung. `TBarSeries`-Daten werden derzeit in der Diagrammvorschau als Linie dargestellt. Rennphysik, Sensoren, Startampel und Strafen sind vereinfachte Modelle. Audio bleibt ein Protokolleintrag. `Now` verwendet eine virtuelle Zeit ab 1970, `FormatDateTime` die gebräuchlichen numerischen Formate. Customer1–3-Symbole benötigen bei numerischer RBS-Zuordnung die passenden Ein-/Aus-IDs unter **Standard-Symbole zuordnen**; Motor-/Bremsschaden sind vorbelegt. Unterordner-Overlays, externe Assets und binäre Dateien werden nicht als AddOn-Dateien importiert. Unbekannte ausgeführte Befehle melden Ereignis und Zeile; sie werden nicht stillschweigend übersprungen. Eine Live-Verbindung stoppt die lokale AddOn-Ausführung.

Im installierten `mp\Cp-ChaosHandlingCU-Arduino_dialog` vergleicht der Quelltext teilweise `cpGetRacingStatus()` mit T/Q. Der Editor weist darauf hin. Diese Quelltextlogik wurde nicht umgeschrieben; für Training/Qualifikation muss das AddOn selbst `cpGetRacingMode()` abfragen.

### Slot-Schriftfarbe und Slot-Hintergrund

`slotcolor` bezeichnet die Slot-Schriftfarbe, `slotcolorbg` den Hintergrund. Beide Farben sind pro Spur getrennt einstellbar und folgen bei sortierter Darstellung dem Fahrer. Live werden `slotfarbefont` und `slotfarbeback` übernommen. Die Vorschau schreibt die ursprünglichen Farbattribute nicht um.

### Neu in 0.2

- Ereignissymbole: Ein-/Aus-Ereignisse pro Spur auslösen, Sichtbarkeit manuell vorgeben; Ereignis-IDs im Eigenschaftenbereich bearbeiten.
- Tank-, Rennzeit-, Straf- und AddOn-Balken mit getrennten Werten, horizontaler/vertikaler Darstellung, Reserve- und Rahmenfarbe. Vorschauwerte und Farben lassen sich pro Spur übersteuern.
- DataGrid zeigt während der Simulation aufgezeichnete Runden. Spalten bleiben beim Duplizieren, Spurwechsel und Löschen eines Tabellenkopfs zusammen. CSV-Export ist im Modus **Vorschau** bedienbar. Spaltenattribute sind über die Ebenenliste/Alle XML-Attribute bearbeitbar.
- Fahrer-/Fahrzeugbilder und Nationalflaggen aus der vorhandenen Cockpit-Datenbank: Simulator → **Erweiterte Simulation** → **Cockpit-Datenbank lesen**, Spur auswählen und Fahrer/Fahrzeug zuordnen. Die Datenbank wird ausschließlich lesend geöffnet.
- Windows-Systemfarben werden aus der aktuellen Windows-Palette gelesen. Bitmap-Transparenzfarbe wird in der Vorschau angewendet (exakte Farbe, Bilder bis 16 Megapixel).
- Rundenhistorie verwendet aufgezeichnete Runden; Optionen `R#`, `Z#`, `SR#`, `SZ#` trennen Runde/Zeit und sortieren nach schnellsten Zeiten. Rennzeit unterstützt Nachkommastellen und `option="h"`. `len` wird als Platzhalterbreite berücksichtigt. Zusätzliche Differenz-, Durchschnitts-, Straf- und Verbrauchswerte werden simuliert.
- **Live-Daten verbinden** liest Status, Rundenzeiten, Positionen, Tankstände, Fahrernamen und Rennvorgaben über die Cockpit-API. Es werden ausschließlich GET-Anfragen gesendet. Unterbrechungen beenden die Verbindung mit einer Fehlermeldung; es werden keine Rennen oder Hardwareaktionen ausgelöst.

Für Live-Daten die API in Cockpit aktivieren und die dort konfigurierte Adresse im Simulator eintragen. Der vorbelegte Wert `http://localhost:8080` ist ein Beispiel. Der Live-Client wurde gegen einen lokalen Testserver geprüft; ein vollständiger Test gegen die laufende Cockpit-Instanz steht noch aus. Die Tabelle erfasst während der Verbindung beobachtete Runden, keine rückwirkend vollständige Rennhistorie. Bei ausgelassenen API-Abfragen können Zwischenrunden fehlen.

**Verbleibende Grenzen:** Die AddOn-Ausführung deckt den oben beschriebenen Teilumfang ab. Die normale Live-API liefert nicht alle AddOn-internen Zustände; diese lassen sich als Vorschauwerte, Balkenwerte und Symbolereignisse setzen. Direkte CU-/USB-Steuerung ist nicht enthalten. Sonderoptionen einzelner Variablen, Rekord-/Serienrennendaten, einige dynamische Bildarten, Symbol-Transparenzoptionen und spezielle Strafbalkendarstellungen sind noch nicht vollständig nachgebildet. DataGrid stellt derzeit Runde, Rundenzeit, Tank sowie simulierte Sektor-/Zwischenzeiten dar; andere Spalten zeigen „—“. Schriftmetriken, Grafikdetails und Ebenendarstellung können von Cockpit abweichen. Es gibt daher weiterhin keine Zusage vollständiger oder pixelidentischer Cockpit-Kompatibilität. Unbekannte XML-Eigenschaften bleiben erhalten; nicht simulierte Variablen behalten ihren Original-Vorschautext oder einen manuell gesetzten Vorschauwert.

Die abschließende Rendering- und Laufzeitprüfung erfolgt in Cockpit-XP. Bis dahin ist diese Version als Preview zu verwenden. Das automatisch von Cockpit erzeugte `ConvertRBS`-Verzeichnis kann eine ältere konvertierte Kopie enthalten; die Cockpit-Dokumentation erklärt dieses Verhalten.

## Technik und Entwicklung

**Vue 3 + TypeScript + Vite** für Oberfläche, XML-Modell, SVG-Arbeitsfläche und Simulation; **Tauri 2 + Rust** für Windows-Fenster, Dateidialoge, Lesen, Zeichensätze, Sicherungen und Speichern. SVG ermöglicht auswählbare Texte und Grafiken ohne ein zusätzliches Canvas-Framework. Die native Dateischicht ist getrennt vom Editorzustand und testbar.

```powershell
npm ci
npm run desktop          # Windows-App im Entwicklungsmodus
npm run desktop:build    # EXE und NSIS-Installer
npm run dev              # Browser-Vorschau mit eingeschränkter Dateifunktion
npm run build            # TypeScript-Prüfung und Frontend-Build
npm test                 # XML-, Vorlagen- und Simulatortests
npm run test:ui          # Bedienungstests über Microsoft Edge
powershell -File scripts/desktop.ps1 test  # Rust-Dateisicherheitstests
```

Voraussetzungen zum Bauen: Node.js ab 22.12, Rust mit MSVC-Toolchain und Visual Studio C++ Build Tools. Die auf diesem Rechner projektlokal eingerichtete Rust-Toolchain unter `.tools` wird von `scripts/desktop.ps1` automatisch verwendet; ohne diese wird die systemweite Toolchain verwendet. `package-lock.json` und `src-tauri/Cargo.lock` halten die konkreten Abhängigkeiten fest.

Struktur:

- `src/core/xml.ts`: validiertes XML-Modell und gezielte Änderungen von Quelltextbereichen.
- `src/core/editor.ts`: Dokumentzustand, Auswahl, Historie, Wiederherstellung und Dateibefehle.
- `src/core/templates.ts`: native Cockpit-XML-Vorlagen.
- `src/core/simulator.ts`: von den Dokumentdaten getrennte Beispiel-Rennsimulation.
- `src/components/RbsCanvas.vue`: SVG-Darstellung und Zeigerinteraktion.
- `src/components/Inspector.vue`: Eigenschaften und Rohattribute.
- `src-tauri/src/main.rs`: native Datei- und Dialogschicht.

## Geprüft

- 152 Frontend-Tests, darunter 106 lokale Cockpit-RBS: Import, unveränderte Quelltexte, gezielte Attributänderung und exakte Rückänderung. Zusätzlich Pascal-Ausführung, Zeitplanung, Fehler-/Schleifenschutz, virtuelle Dateien der lokale Pace-Car-Zyklus, 28 installierte AddOn-Pakete, Array-/Referenzsemantik, Dialog-Callbacks, parallele Pakete, Strafabläufe und originale Regen-/Schadenslogik. Die Originaldateien werden nur gelesen.
- 10 Rust-Tests: Byteidentität einschließlich der lokalen RBS-Sammlung, Backup-Inhalt, Konfliktschutz, Bildkopien/Bildkonflikte, Unicode/Zeichensatzwechsel und Zurückweisung fehlerhaften XMLs; zusätzlich lesender Datenbankzugriff und API-Abrufe gegen einen lokalen Testserver sowie AddOn-/Overlay-Import.
- 9 Edge-Bedienungstests: Bearbeiten/Rückgängig/Wiederholen/Duplizieren/Export, Legacy-Import ohne Änderung durch Simulation, Neuanlage/Ziehen/Größenänderung/Fahrerzeilenkopie, eingepasste Simulatorvorschau sowie Tabellenkopie, CSV-Export und erweiterte Simulationsregler, Slotfarbpaare und AddOn-Overlay/Ausgaben ohne XML-Änderung. Neu: bedienbare Dialoge, parallel laufende Pakete, virtuelle Excel-Auswertung mit CSV sowie der originale Joker-Dialog.
- Erfolgreicher TypeScript- und Windows-Release-Build.
- Früherer nativer Basistest (0.3): Windows-Anwendung gestartet, Oberfläche über Windows Accessibility gelesen und nativen Öffnen-Dialog über `Strg+O` aufgerufen. Windows-Screenshot-Erfassung war in der Prüfumgebung nicht verfügbar; die visuelle Prüfung erfolgte am produktiv gebauten Frontend in Edge.

Die lokalen Sammlungstests verwenden standardmäßig das oben genannte Cockpit-Verzeichnis. `RBS_TEST_ROOT` kann ein anderes RBS-Testverzeichnis setzen; `COCKPIT_ADDON_ROOT` legt das Verzeichnis für den AddOn-Sammlungstest fest. Ist kein Verzeichnis vorhanden, wird nur dieser lokale Sammlungsteil übersprungen.

## Referenzen

- [Cockpit-XP: AddOn-Befehle](https://wiki.cockpit-xp.de/dokuwiki/doku.php?id=cockpit-xp:addon:befehlsreferenz:befehlsreferenz)
- [Cockpit-XP: API](https://wiki.cockpit-xp.de/xpdashboard/doku/05_Datenschnittstellen/Cockpit-API/)

- [Cockpit-XP: RBS-Variablen](https://wiki.cockpit-xp.de/dokuwiki/doku.php?id=cockpit-xp:rennbildschirm:rbs-variablen)
- [Cockpit-XP: RBS-XML-Datei](https://wiki.cockpit-xp.de/dokuwiki/doku.php?id=cockpit-xp:faq:workshop:rbs-xml-datei)
- [Cockpit-XP: Änderungen am RBS werden nicht übernommen](https://wiki.cockpit-xp.de/dokuwiki/doku.php?id=cockpit-xp:faq:aenderungen_am_rbs_inkl._startampel_werden_nicht_uebernommen)
- [Tauri: Windows-Voraussetzungen](https://v2.tauri.app/start/prerequisites/)
- [Tauri: Windows-Installer](https://v2.tauri.app/distribute/windows-installer/)

RBS Studio ist ein eigenständiges Projekt und kein offizielles Cockpit-XP-Produkt.
